/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес на сървъра за онлайн игра (напр. wss://bum.example.com). Без него – същият хост, порт 2567. */
  readonly VITE_SERVER_URL?: string;
}
