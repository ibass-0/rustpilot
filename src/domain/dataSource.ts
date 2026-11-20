export type EngineKind = 'sqlite' | 'postgres' | 'mysql' | 'mariadb' | 'mssql' | 'redis' | 'kafka' | 'rabbitmq';

/** Engines the backend can connect to today. */
export const SUPPORTED_ENGINES: readonly EngineKind[] = ['sqlite', 'postgres', 'mysql', 'mariadb'];

/** Engines reached over the network with a host, a user and a password. */
export const SERVER_ENGINES: readonly EngineKind[] = ['postgres', 'mysql', 'mariadb'];

export const isServerEngine = (engine: EngineKind): boolean => SERVER_ENGINES.includes(engine);

export const ENGINE_LABELS: Record<EngineKind, string> = {
  sqlite: 'SQLite',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  mssql: 'SQL Server',
  redis: 'Redis',
  kafka: 'Kafka',
  rabbitmq: 'RabbitMQ',
};

export type SslMode = 'disable' | 'prefer' | 'require';
const SSL_MODES: readonly string[] = ['disable', 'prefer', 'require'];

/** A saved connection. Holds no secrets: the password lives in the Credential Manager. */
export interface DataSourceConfig {
  id: string;
  name: string;
  engine: EngineKind;
  /** SQLite only. */
  filePath: string | null;
  readOnly: boolean;
  /** Server engines only. */
  host: string | null;
  /** `null` means the engine's default port. */
  port: number | null;
  database: string | null;
  user: string | null;
  sslMode: SslMode;
  /** Whether the password is kept in the Credential Manager. */
  savePassword: boolean;
}

export type NodeKind = 'schema' | 'folder' | 'table' | 'view' | 'column';

export interface DataNode {
  /** Path segments from the connection root, e.g. `['main', 'tables', 'users']`. */
  path: string[];
  label: string;
  kind: NodeKind;
  /** Greyed text after the label, e.g. `INTEGER, PK`. */
  detail: string | null;
  hasChildren: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** The port an engine listens on unless told otherwise. */
export function defaultPort(engine: EngineKind): number | null {
  if (engine === 'postgres') return 5432;
  if (engine === 'mysql' || engine === 'mariadb') return 3306;
  return null;
}

/** The dialect the editor completes and highlights for an engine. */
export function sqlDialect(engine: EngineKind): 'sqlite' | 'postgres' | 'mysql' | 'mariadb' {
  if (engine === 'postgres' || engine === 'mysql' || engine === 'mariadb') return engine;
  return 'sqlite';
}

/** A blank form for `engine`. */
export function newConfig(engine: EngineKind, id: string): DataSourceConfig {
  const server = isServerEngine(engine);
  return {
    id,
    name: '',
    engine,
    filePath: null,
    readOnly: false,
    host: server ? 'localhost' : null,
    port: null,
    database: null,
    user: server ? '' : null,
    sslMode: 'prefer',
    savePassword: false,
  };
}

/**
 * Read a stored value as a config. Settings added after it was saved get their
 * defaults; anything that is not a config gives `null`.
 */
export function normalizeConfig(value: unknown): DataSourceConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  if (typeof v.engine !== 'string' || !(v.engine in ENGINE_LABELS)) return null;
  const text = (field: unknown): string | null => (typeof field === 'string' ? field : null);
  return {
    id: v.id,
    name: v.name,
    engine: v.engine as EngineKind,
    filePath: text(v.filePath),
    readOnly: v.readOnly === true,
    host: text(v.host),
    port: typeof v.port === 'number' ? v.port : null,
    database: text(v.database),
    user: text(v.user),
    sslMode: typeof v.sslMode === 'string' && SSL_MODES.includes(v.sslMode) ? (v.sslMode as SslMode) : 'prefer',
    savePassword: v.savePassword === true,
  };
}

/** The message to show under the form, or `null` when the config is complete. */
export function validateConfig(config: DataSourceConfig): string | null {
  if (config.name.trim() === '') return 'Enter a name.';
  if (!SUPPORTED_ENGINES.includes(config.engine)) return `${ENGINE_LABELS[config.engine]} is not supported yet.`;
  if (config.engine === 'sqlite') return (config.filePath ?? '').trim() === '' ? 'Choose a database file.' : null;
  if ((config.host ?? '').trim() === '') return 'Enter a host.';
  if ((config.user ?? '').trim() === '') return 'Enter a user.';
  if (config.port !== null && !(Number.isInteger(config.port) && config.port >= 1 && config.port <= 65535)) {
    return 'Enter a port between 1 and 65535.';
  }
  return null;
}

/** Where a connection points, for tooltips. Never contains a password. */
export function describeTarget(config: DataSourceConfig): string {
  if (!isServerEngine(config.engine)) return config.filePath ?? config.name;
  const port = config.port ?? defaultPort(config.engine);
  const database = (config.database ?? '').trim();
  return `${config.user ?? ''}@${config.host ?? ''}${port === null ? '' : `:${port}`}${database ? `/${database}` : ''}`;
}

/** A starting name for a new connection: the SQLite file name, or the server host. */
export function defaultName(config: DataSourceConfig): string {
  if (isServerEngine(config.engine)) return (config.host ?? '').trim() || ENGINE_LABELS[config.engine];
  const path = (config.filePath ?? '').trim();
  if (path === '') return ENGINE_LABELS[config.engine];
  const file = path.split(/[\\/]/).pop() ?? path;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

/** A stable map key for a tree path; the root path gives the empty string. */
export function nodeKey(path: readonly string[]): string {
  return path.map(encodeURIComponent).join('/');
}

/** The inverse of `nodeKey`. */
export function pathOfKey(key: string): string[] {
  return key === '' ? [] : key.split('/').map(decodeURIComponent);
}
