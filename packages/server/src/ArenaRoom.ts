/**
 * ArenaRoom – една стая в Colyseus = една арена с безкраен цикъл от рундове.
 *
 * Сървърът е авторитетен: само тук се върти World. Клиентите пращат вход ('i'),
 * стаята праща снимка ('s') след всеки тик и roster ('r') при всяка смяна на играчите.
 * Не ползваме Schema състояние на Colyseus – само собствените ни съобщения (net/protocol.ts).
 *
 * Жизнен цикъл:
 *   лоби (до lobbyMs или докато стаята се напълни; чака поне 1 човек)
 *     → рунд: нов World (хора + ботове до ROOM_SIZE) → отброяване → игра → край
 *     → резултати (resultsMs, светът продължава да се смята) → нов рунд → …
 * Лоби има само веднъж – при създаване на стаята. След резултатите следващият
 * рунд започва директно (отброяването му е „почивката“).
 */
import {
  ABILITY_IDS,
  BOT_NAMES,
  BotBrain,
  MSG,
  PROTOCOL_VERSION,
  ROOM_SIZE,
  SHOP_ITEM_IDS,
  World,
  cloneBalance,
  encodeSnapshot,
  pickDifficulty,
  type Balance,
  type InputMessage,
  type PlayerInput,
  type RosterMessage,
  type ShopItemId,
  RESULTS_SECONDS,
} from '@bum/shared';
import { ErrorCode, Room, ServerError, type Client } from 'colyseus';
import { SKINS, sanitizeProfile, type Profile } from './profile';

/** Времена на стаята. Сървърът ги задава при define() – клиентът не може да ги смени. */
export interface RoomTimings {
  /** Лоби преди първия рунд (ms). */
  lobbyMs: number;
  /** Колко се показват резултатите след края на рунда (ms). */
  resultsMs: number;
  /** Отброяване преди игра (сек); по подразбиране от баланса. Само за тестове. */
  countdownSec?: number;
  /** Продължителност на рунда (сек); по подразбиране от баланса. Само за тестове. */
  roundSec?: number;
}

export const DEFAULT_TIMINGS: RoomTimings = { lobbyMs: 8000, resultsMs: RESULTS_SECONDS * 1000 };

/** Опциите на onCreate: от клиента (JoinOptions) + от сървъра (timings). */
interface CreateOptions {
  private?: unknown;
  timings?: RoomTimings;
}

/**
 * Roster, както го праща сървърът. Освен полетата от протокола има и `lobby`:
 * true = чакалня преди първия рунд (светът не се смята, ботовете още ги няма,
 * а `round.timeLeft` в снимките = секунди до старта на рунда).
 */
export interface ServerRoster extends RosterMessage {
  lobby: boolean;
}

/** Човек в стаята (свързан клиент). */
interface Human extends Profile {
  client: Client;
  /** id на неговото човече в текущия свят; -1 = гледа. */
  playerId: number;
  /** Последният получен вход. */
  mx: number;
  my: number;
  held: boolean;
  /** Натиснат ли е бутонът след последния тик (кратко натискане между два тика не се губи). */
  pressed: boolean;
  /** Покупка, която чака следващия тик (изпълнява се веднъж). */
  buy: ShopItemId | null;
}

/** Колко пропуснати тика наваксваме наведнъж, ако процесът се е забавил. */
const MAX_CATCHUP_STEPS = 3;
/** Защита от наводняване: клиентът праща вход до 30 пъти/сек. */
const MAX_MESSAGES_PER_SECOND = 120;

const randomSeed = () => Math.floor(Math.random() * 2 ** 32) >>> 0;

export class ArenaRoom extends Room {
  override maxClients = ROOM_SIZE;
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;

  private timings: RoomTimings = DEFAULT_TIMINGS;
  private cfg!: Balance;
  private isPrivate = false;
  /** Хората по ред на влизане (Map пази реда). */
  private readonly humans = new Map<string, Human>();
  /** Мозъци на ботовете в текущия свят (вкл. човечетата на излезли хора). */
  private bots = new Map<number, BotBrain>();
  private world!: World;
  private inLobby = true;
  private lobbyLeft = 0;
  private roundNo = 0;
  private stepMs = 0;
  private accumulator = 0;

  /**
   * Проверка при търсене на стая (HTTP, преди създаване/влизане):
   * несъвместим клиент изобщо не стига до стаята.
   */
  static override async onAuth(_token: string, options: unknown): Promise<boolean> {
    const v = options && typeof options === 'object' ? (options as { v?: unknown }).v : undefined;
    if (v !== PROTOCOL_VERSION) {
      throw new ServerError(
        ErrorCode.APPLICATION_ERROR,
        `protocol: server ${PROTOCOL_VERSION}, client ${String(v)}`,
      );
    }
    return true;
  }

  override async onCreate(options: CreateOptions): Promise<void> {
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
    this.cfg = cloneBalance();
    if (this.timings.countdownSec !== undefined)
      this.cfg.round.countdown = this.timings.countdownSec;
    if (this.timings.roundSec !== undefined) this.cfg.round.duration = this.timings.roundSec;

    this.isPrivate = options.private === true;
    if (this.isPrivate) await this.setPrivate(true);

    this.lobbyLeft = this.timings.lobbyMs / 1000;
    this.world = this.buildLobbyWorld();

    this.onMessage(MSG.input, (client, msg: unknown) => this.handleInput(client, msg));

    this.stepMs = 1000 / this.cfg.sim.tickRate;
    this.setTimestep((deltaMs) => this.onFrame(deltaMs), this.stepMs);
    console.log(`[стая ${this.roomId}] създадена${this.isPrivate ? ' (частна)' : ''}`);
  }

  override onJoin(client: Client, options: unknown): void {
    const human: Human = {
      ...sanitizeProfile(options),
      client,
      playerId: -1,
      mx: 0,
      my: 0,
      held: false,
      pressed: false,
      buy: null,
    };
    this.humans.set(client.sessionId, human);

    if (this.inLobby) {
      this.world = this.buildLobbyWorld();
      this.sendRosterToAll();
    } else if (this.takeOverBot(human)) {
      // Рундът е още в отброяване – новодошлият заема мястото на бот.
      this.sendRosterToAll();
    } else {
      // По средата на рунда – гледа до следващия.
      this.sendRoster(human);
    }
  }

  override onLeave(client: Client): void {
    const human = this.humans.get(client.sessionId);
    this.humans.delete(client.sessionId);
    if (!human) return;

    if (this.inLobby) {
      this.world = this.buildLobbyWorld();
      this.sendRosterToAll();
    } else if (human.playerId >= 0) {
      // Човечето му довършва рунда като бот.
      this.makeBot(human.playerId);
    }
  }

  override onDispose(): void {
    console.log(`[стая ${this.roomId}] затворена`);
  }

  // ── Вход ──

  /** Последният вход на играча. Всичко се проверява – клиентът може да прати каквото си иска. */
  private handleInput(client: Client, msg: unknown): void {
    const human = this.humans.get(client.sessionId);
    if (!human || !msg || typeof msg !== 'object') return;
    const m = msg as Partial<Record<keyof InputMessage, unknown>>;
    human.mx = clampAxis(m.mx);
    human.my = clampAxis(m.my);
    human.held = m.a === 1;
    if (human.held) human.pressed = true;
    if (typeof m.b === 'string' && (SHOP_ITEM_IDS as readonly string[]).includes(m.b))
      human.buy = m.b as ShopItemId;
  }

  /** Входовете за един тик: хората (последното получено) + ботовете. */
  private collectInputs(): Map<number, PlayerInput> {
    const inputs = new Map<number, PlayerInput>();
    for (const h of this.humans.values()) {
      if (h.playerId < 0) continue;
      inputs.set(h.playerId, { mx: h.mx, my: h.my, ability: h.held || h.pressed, buy: h.buy });
      h.pressed = false;
      h.buy = null;
    }
    for (const bot of this.bots.values()) inputs.set(bot.playerId, bot.think(this.world));
    return inputs;
  }

  // ── Тик ──

  /** Вика се от часовника на стаята; смята точно tickRate стъпки в секунда (с малко наваксване). */
  private onFrame(deltaMs: number): void {
    this.accumulator += deltaMs;
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < MAX_CATCHUP_STEPS) {
      this.accumulator -= this.stepMs;
      this.step();
      steps++;
    }
    // Голямо забавяне – не догонваме безкрайно.
    if (this.accumulator >= this.stepMs) this.accumulator = 0;
  }

  private step(): void {
    if (this.inLobby) this.stepLobby();
    else this.stepRound();
  }

  /** Лоби: светът стои, тече само времето до старта. */
  private stepLobby(): void {
    this.lobbyLeft -= this.world.dt;
    const humans = this.humans.size;
    if (humans > 0 && (this.lobbyLeft <= 0 || humans >= ROOM_SIZE)) {
      this.startRound();
      return;
    }
    // Номерът на тика расте, за да може клиентът да подрежда снимките.
    this.world.tick++;
    this.world.round.timeLeft = Math.max(0, this.lobbyLeft);
    this.world.events.length = 0;
    this.broadcast(MSG.snapshot, encodeSnapshot(this.world));
  }

  /** Рунд: една стъпка на света → снимка; след резултатите – нов рунд. */
  private stepRound(): void {
    this.world.step(this.collectInputs());
    this.broadcast(MSG.snapshot, encodeSnapshot(this.world));

    const r = this.world.round;
    if (r.phase === 'ended' && r.phaseTime * 1000 >= this.timings.resultsMs) this.startRound();
  }

  // ── Рундове ──

  /** Нов свят: всички хора (и гледащите) + ботове до ROOM_SIZE. */
  private startRound(): void {
    this.inLobby = false;
    this.roundNo++;
    this.world = new World({ cfg: this.cfg, seed: randomSeed() });
    this.bots = new Map();

    for (const h of this.humans.values()) {
      h.playerId = this.world.addPlayer({ name: h.name, skin: h.skin, ability: h.ability }).id;
      h.pressed = false;
      h.buy = null;
    }
    this.addBots(ROOM_SIZE - this.world.players.length);
    this.sendRosterToAll();
  }

  /** Ботове с различни имена и скинове (не като на хората), случайни суперсили и трудност. */
  private addBots(count: number): void {
    const w = this.world;
    const taken = new Set(w.players.map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n));
    const usedSkins = new Set(w.players.map((p) => p.skin));
    let skins = SKINS.filter((s) => !usedSkins.has(s));

    for (let i = 0; i < count; i++) {
      if (skins.length === 0) skins = [...SKINS];
      const name = names.splice(w.rng.int(0, names.length - 1), 1)[0] ?? `Bot${i + 1}`;
      const skin = skins.splice(w.rng.int(0, skins.length - 1), 1)[0]!;
      const p = w.addPlayer({ name, isBot: true, skin, ability: w.rng.pick(ABILITY_IDS) });
      const difficulty = pickDifficulty(this.cfg, w.rng);
      this.bots.set(p.id, new BotBrain(p.id, difficulty, (w.seed ^ (p.id * 2654435761)) >>> 0));
    }
  }

  /** Излязъл играч: човечето му продължава с мозък на бот до края на рунда. */
  private makeBot(playerId: number): void {
    const p = this.world.getPlayer(playerId);
    if (!p) return;
    p.isBot = true;
    this.bots.set(playerId, new BotBrain(playerId, 'normal', randomSeed()));
  }

  /**
   * Влизане по време на отброяването: човекът поема един от ботовете
   * (още никой не е мръднал, така че е честно). Връща false, ако не може.
   */
  private takeOverBot(human: Human): boolean {
    if (this.world.round.phase !== 'countdown') return false;
    const p = this.world.players.find((pl) => pl.isBot && this.bots.has(pl.id));
    if (!p) return false;
    this.bots.delete(p.id);
    p.isBot = false;
    p.name = human.name;
    p.skin = human.skin;
    p.ability = human.ability;
    human.playerId = p.id;
    return true;
  }

  /** Чакалнята: само хората, без ботове; светът не се смята. */
  private buildLobbyWorld(): World {
    const world = new World({ cfg: this.cfg, seed: randomSeed() });
    // Номерът на тика продължава (снимките в лобито вървят нагоре, дори светът да е нов).
    world.tick = this.world ? this.world.tick : 0;
    for (const h of this.humans.values()) {
      h.playerId = world.addPlayer({ name: h.name, skin: h.skin, ability: h.ability }).id;
    }
    world.round.timeLeft = Math.max(0, this.lobbyLeft);
    return world;
  }

  // ── Roster ──

  private rosterBase(): Omit<ServerRoster, 'you'> {
    return {
      round: this.roundNo,
      players: this.world.players.map((p) => ({
        id: p.id,
        name: p.name,
        skin: p.skin,
        ability: p.ability,
        isBot: p.isBot,
        colorIndex: p.colorIndex,
      })),
      roomId: this.roomId,
      private: this.isPrivate,
      lobby: this.inLobby,
    };
  }

  /** Всеки получава същия списък, но със свой `you`. */
  private sendRosterToAll(): void {
    const base = this.rosterBase();
    for (const h of this.humans.values()) h.client.send(MSG.roster, { ...base, you: h.playerId });
  }

  private sendRoster(human: Human): void {
    human.client.send(MSG.roster, { ...this.rosterBase(), you: human.playerId });
  }
}

/** Ос на джойстика: число в [-1, 1], всичко друго → 0. */
function clampAxis(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}
