import { Client, MatchMakeError } from '@colyseus/sdk';
import {
  BALANCE,
  DEFAULT_PORT,
  MSG,
  PROTOCOL_VERSION,
  RESULTS_SECONDS,
  ROOM_NAME,
  World,
  applySnapshot,
  type Balance,
  type GameEvent,
  type InputMessage,
  type JoinOptions,
  type Player,
  type RosterEntry,
  type RosterMessage,
  type Snapshot,
} from '@bum/shared';
import type { InputSource, Match } from '../game/Match';
import type { PlayerSettings } from '../game/settings';
import { InputSender } from './InputSender';
import { OwnPlayerSmoother } from './OwnPlayerSmoother';
import { SnapshotBuffer } from './SnapshotBuffer';

/** Пинг – на толкова секунди. */
const PING_EVERY = 2;
/** Собственото човече се екстраполира най-много толкова секунди напред. */
const MAX_EXTRAPOLATION = 0.1;
/** Колко чакаме свързването, преди да се откажем. */
const CONNECT_TIMEOUT_MS = 10000;

/**
 * Каквото NetGame ползва от стаята на Colyseus. Отделено, за да може NetGame
 * да се тества с фалшива стая (без сървър).
 */
export interface NetRoom {
  readonly roomId: string;
  send(type: string, payload: InputMessage): void;
  onMessage(type: string, cb: (payload: unknown) => void): void;
  /** Връзката е затворена (code – WebSocket код). */
  onLeave(cb: (code: number) => void): void;
  ping(cb: (ms: number) => void): void;
  leave(): void;
}

export interface NetGameOptions {
  settings: PlayerSettings;
  /** Създали сме частна стая (до първия roster не го знаем от сървъра). */
  isPrivate?: boolean;
  cfg?: Balance;
  /** Местно време в секунди (за тестовете). */
  now?: () => number;
}

/** Грешка при свързване; key е ключ за превод на текста за играча. */
export class NetError extends Error {
  constructor(readonly key: string, cause?: unknown) {
    super(key);
    this.name = 'NetError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Онлайн игра: светът идва от сървъра (авторитетен), клиентът само го рисува.
 *
 * - 'r' (roster) → нов World-огледало със същите играчи (същите id) – нов рунд.
 * - 's' (снимка) → буфер; рисуваме 100 ms назад във времето между две снимки
 *   (prevX/prevY = по-старата, x/y = по-новата, alpha = къде сме между тях).
 *   Събитията на всяка приложена снимка отиват в drainEvents() точно веднъж.
 * - Собственото човече – от последната снимка + екстраполация (без закъснение).
 * - Входът → 'i' до 30 пъти/сек, само при промяна или като пулс (InputSender).
 */
export class NetGame implements Match {
  readonly online = true;
  world: World;
  /** Огледало на най-новата снимка – оттам е собственото човече. */
  private latestWorld: World;
  humanId: number;
  roundId = 0;
  /** Лоби (roster.lobby) – сървърът чака хора, светът не се симулира. */
  private lobby = true;
  /** Още няма приложена снимка за този свят. */
  private noFrameYet = true;
  roomId: string;
  isPrivate: boolean;
  ping: number | null = null;
  disconnected: string | null = null;

  private readonly cfg: Balance;
  private readonly settings: PlayerSettings;
  private readonly now: () => number;
  private readonly buffer: SnapshotBuffer;
  private readonly sender: InputSender;
  private readonly own = new OwnPlayerSmoother();
  private readonly spectator: Player;
  private _alpha = 1;
  private hasRoster = false;
  private lastLatestTick = -1;
  private nextPingAt = 0;
  /** Кога (местно време) сме видели края на рунда. */
  private endedAt: number | null = null;
  private left = false;

  constructor(
    private readonly room: NetRoom,
    opts: NetGameOptions,
  ) {
    this.cfg = opts.cfg ?? BALANCE;
    this.settings = opts.settings;
    this.now = opts.now ?? (() => performance.now() / 1000);
    this.roomId = room.roomId;
    this.isPrivate = opts.isPrivate ?? false;
    this.buffer = new SnapshotBuffer(this.cfg.sim.tickRate);
    this.sender = new InputSender((msg) => this.room.send(MSG.input, msg));

    // Докато сървърът не каже кой играе – само ти, в лобито.
    const me: RosterEntry = {
      id: 1,
      name: this.settings.name,
      skin: this.settings.skin,
      ability: this.settings.ability,
      isBot: false,
      colorIndex: 0,
    };
    this.world = this.makeWorld([me]);
    this.latestWorld = this.world;
    this.humanId = me.id;
    this.world.round.phase = 'countdown';

    // „Празен“ паднал играч за гледащите – не е в света, id -1.
    const dummy = new World({ cfg: this.cfg }).addPlayer({ name: this.settings.name, skin: this.settings.skin, ability: this.settings.ability });
    this.spectator = { ...dummy, id: -1, alive: false, fallTime: 99, x: 0, y: 0, prevX: 0, prevY: 0 };

    room.onMessage(MSG.roster, (r) => this.onRoster(r as RosterMessage));
    room.onMessage(MSG.snapshot, (s) => this.onSnapshot(s as Snapshot));
    room.onLeave(() => {
      if (!this.left) this.disconnected = 'net.error.disconnected';
    });
  }

  get human(): Player {
    return this.world.getPlayer(this.humanId) ?? this.spectator;
  }

  get alpha(): number {
    return this._alpha;
  }

  get isSpectator(): boolean {
    return this.humanId < 0;
  }

  get waiting(): boolean {
    return this.lobby || this.noFrameYet;
  }

  /** В лобито: секунди до първия рунд (сървърът ги праща в round.timeLeft). */
  get startsIn(): number | null {
    if (!this.lobby || this.noFrameYet) return null;
    return Math.max(0, Math.ceil(this.world.round.timeLeft));
  }

  get nextRoundIn(): number | null {
    if (this.world.round.phase !== 'ended' || this.endedAt === null) return null;
    const elapsed = Math.max(this.world.round.phaseTime, this.now() - this.endedAt);
    return Math.max(0, Math.ceil(RESULTS_SECONDS - elapsed));
  }

  /** Hit-stop онлайн не спира нищо: светът е на сървъра. */
  freeze(_seconds: number): void {}

  drainEvents(): GameEvent[] {
    return this.buffer.drainEvents();
  }

  update(frameSec: number, input: InputSource): void {
    const now = this.now();
    if (this.disconnected || this.left) {
      input.consumeAbility();
      return;
    }

    // Вход – само ако играеш в този рунд (в лобито светът стои).
    if (this.hasRoster && !this.waiting && this.humanId >= 0) this.sender.update(now, input);
    else input.consumeAbility();

    if (now >= this.nextPingAt) {
      this.nextPingAt = now + PING_EVERY;
      this.room.ping((ms) => (this.ping = ms));
    }

    const frame = this.buffer.advance(now);
    if (frame) {
      this.applyFrame(frame.from, frame.to, frame.alpha);
      this.updateOwn(now, frameSec);
      this.noFrameYet = false;
    }

    if (this.world.round.phase === 'ended') this.endedAt ??= now;
    else this.endedAt = null;
  }

  dispose(): void {
    if (this.left) return;
    this.left = true;
    try {
      this.room.leave();
    } catch {
      // връзката вече е затворена
    }
  }

  // ───────────── Съобщения от сървъра ─────────────

  /**
   * Нов roster = нов свят: при всяко влизане/излизане в лобито (id-тата се преномерират),
   * при нов рунд и когато закъснял заеме мястото на бот по време на отброяването.
   */
  private onRoster(r: RosterMessage): void {
    let world: World;
    let latest: World;
    try {
      world = this.makeWorld(r.players);
      latest = this.makeWorld(r.players);
    } catch (err) {
      console.error(err);
      this.disconnected = 'net.error.protocol';
      this.dispose();
      return;
    }
    // До първата снимка рундът „чака“ (лоби/отброяване).
    world.round.phase = 'countdown';
    this.world = world;
    this.latestWorld = latest;
    this.humanId = r.you;
    if (r.roomId) this.roomId = r.roomId;
    this.isPrivate = r.private;
    this.hasRoster = true;
    this.lobby = r.lobby === true;
    this.noFrameYet = true;
    this.buffer.reset();
    this.sender.reset();
    this.own.reset();
    this.lastLatestTick = -1;
    this.endedAt = null;
    this._alpha = 1;
    this.roundId++;
  }

  private onSnapshot(s: Snapshot): void {
    if (!this.hasRoster) return; // светът още не е създаден
    this.buffer.push(s, this.now());
    applySnapshot(this.latestWorld, s);
  }

  /** Огледало на света с играчите от roster-а (id-тата трябва да съвпаднат). */
  private makeWorld(players: readonly RosterEntry[]): World {
    const w = new World({ cfg: this.cfg, seed: 1, skipCountdown: true });
    w.coinSystem.coins.length = 0; // монетите идват от сървъра
    for (const r of players) {
      const p = w.addPlayer({ name: r.name, isBot: r.isBot, skin: r.skin, ability: r.ability, colorIndex: r.colorIndex });
      if (p.id !== r.id) throw new Error(`roster: очаквах id ${r.id}, а е ${p.id}`);
    }
    return w;
  }

  // ───────────── Рисуване ─────────────

  /** prevX/prevY = from, x/y и всичко останало = to. */
  private applyFrame(from: Snapshot, to: Snapshot, alpha: number): void {
    const w = this.world;
    if (from !== to) {
      applySnapshot(w, from);
      for (const p of w.players) {
        p.prevX = p.x;
        p.prevY = p.y;
      }
    }
    applySnapshot(w, to);
    if (from === to) {
      for (const p of w.players) {
        p.prevX = p.x;
        p.prevY = p.y;
      }
    }
    // Събитията се четат от буфера, не от света.
    w.events.length = 0;
    this._alpha = alpha;
  }

  /** Собственото човече: последната снимка + екстраполация, без закъснението. */
  private updateOwn(now: number, frameSec: number): void {
    const me = this.world.getPlayer(this.humanId);
    const lp = this.latestWorld.getPlayer(this.humanId);
    const latest = this.buffer.latest;
    if (!me || !lp || !latest) return;
    const isNew = latest.t !== this.lastLatestTick;
    this.lastLatestTick = latest.t;
    const ahead = Math.min(MAX_EXTRAPOLATION, Math.max(0, this.buffer.serverNow(now) - this.buffer.timeOf(latest)));
    const pos = this.own.update(lp.x + lp.vx * ahead, lp.y + lp.vy * ahead, frameSec, isNew);
    me.x = me.prevX = pos.x;
    me.y = me.prevY = pos.y;
    me.vx = lp.vx;
    me.vy = lp.vy;
    me.facing = lp.facing;
  }
}

// ───────────── Свързване ─────────────

/** Адрес на сървъра: VITE_SERVER_URL или същият хост на порт 2567. */
export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:${DEFAULT_PORT}`;
}

function joinOptions(s: PlayerSettings, isPrivate = false): JoinOptions {
  const o: JoinOptions = { v: PROTOCOL_VERSION, name: s.name, skin: s.skin, ability: s.ability };
  if (isPrivate) o.private = true;
  return o;
}

type ColyseusRoom = Awaited<ReturnType<Client['joinOrCreate']>>;

/** Излиза от стаята. leave() на вече затворена връзка никога не завършва – затова проверяваме. */
function safeLeave(room: ColyseusRoom): void {
  if (room.connection?.isOpen) void room.leave(true).catch(() => undefined);
}

/** Стаята на Colyseus → NetRoom. Без автоматично повторно свързване: прекъсване = край. */
function wrapRoom(room: ColyseusRoom): NetRoom {
  room.reconnection.enabled = false;
  return {
    roomId: room.roomId,
    send: (type, payload) => room.send(type, payload),
    onMessage: (type, cb) => {
      room.onMessage(type, cb);
    },
    onLeave: (cb) => {
      room.onLeave((code: number) => cb(code));
    },
    ping: (cb) => room.ping(cb),
    leave: () => safeLeave(room),
  };
}

/**
 * Превръща грешка от SDK-то в ключ за превод.
 * Мрежова грешка (няма сървър) също идва като MatchMakeError, но без код от Colyseus.
 */
export function netErrorKey(err: unknown): string {
  if (err instanceof NetError) return err.key;
  if (err instanceof MatchMakeError) {
    const msg = err.message.toLowerCase();
    // 522 = няма такава стая; заключена/пълна стая също не може да се влезе по линк.
    if (err.code === 522 || /not found|locked|full|invalid room/.test(msg)) return 'net.error.roomNotFound';
    // 525/526 = стаята отказа (напр. друга версия на протокола).
    if (err.code === 525 || err.code === 526) return 'net.error.rejected';
  }
  return 'net.error.unreachable';
}

async function connect(
  settings: PlayerSettings,
  isPrivate: boolean,
  join: (client: Client) => Promise<ColyseusRoom>,
): Promise<NetGame> {
  const client = new Client(serverUrl());
  const pending = join(client);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NetError('net.error.timeout')), CONNECT_TIMEOUT_MS);
  });
  try {
    const room = await Promise.race([pending, timeout]);
    // Синхронно след влизането (без друг await) – първият roster идва веднага след него.
    return new NetGame(wrapRoom(room), { settings, isPrivate });
  } catch (err) {
    // Ако все пак влезем след изтеклото време – излизаме веднага.
    pending.then(safeLeave).catch(() => undefined);
    throw err instanceof NetError ? err : new NetError(netErrorKey(err), err);
  } finally {
    clearTimeout(timer);
  }
}

/** „Играй онлайн“: влиза в публична стая със свободно място (или създава нова). */
export function quickPlay(settings: PlayerSettings): Promise<NetGame> {
  return connect(settings, false, (c) => c.joinOrCreate(ROOM_NAME, joinOptions(settings)));
}

/** „Играй с приятели“: нова частна стая (влиза се само по линк). */
export function createPrivate(settings: PlayerSettings): Promise<NetGame> {
  return connect(settings, true, (c) => c.create(ROOM_NAME, joinOptions(settings, true)));
}

/** Влизане по линк (?room=ID). */
export function joinRoom(roomId: string, settings: PlayerSettings): Promise<NetGame> {
  return connect(settings, false, (c) => c.joinById(roomId, joinOptions(settings)));
}
