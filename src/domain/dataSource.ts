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

/** How each provider is told apart: a two-letter badge in its own color. Not a brand logo. */
export const ENGINE_BADGES: Record<EngineKind, { text: string; color: string }> = {
  sqlite: { text: 'Sq', color: '#3f86b0' },
  postgres: { text: 'Pg', color: '#4a6fb3' },
  mysql: { text: 'My', color: '#d08a2e' },
  mariadb: { text: 'Ma', color: '#a8724f' },
  mssql: { text: 'Ms', color: '#c2453f' },
  redis: { text: 'Re', color: '#d1453b' },
  kafka: { text: 'Kf', color: '#6f7480' },
  rabbitmq: { text: 'Rb', color: '#e07b39' },
};

export type Environment = 'local' | 'sandbox' | 'dev';

export const ENVIRONMENTS: readonly { id: Environment; label: string; color: string }[] = [
  { id: 'local', label: 'Local', color: '#5fb865' },
  { id: 'sandbox', label: 'Sandbox', color: '#d6a74f' },
  { id: 'dev', label: 'Dev', color: '#5b9be0' },
];

/** The colors a connection or group can be marked with. */
export const COLOR_PALETTE: readonly { id: string; label: string; value: string }[] = [
  { id: 'red', label: 'Red', value: '#e5585d' },
  { id: 'orange', label: 'Orange', value: '#ee7a3c' },
  { id: 'yellow', label: 'Yellow', value: '#d9b44a' },
  { id: 'green', label: 'Green', value: '#5fb865' },
  { id: 'teal', label: 'Teal', value: '#3fb8a9' },
  { id: 'blue', label: 'Blue', value: '#5b9be0' },
  { id: 'purple', label: 'Purple', value: '#a47ee0' },
  { id: 'pink', label: 'Pink', value: '#df6fae' },
];

/** The CSS color a connection is marked with: its own color, else its environment color, else none. */
export function effectiveColor(config: { color: string | null; environment: Environment | null }): string | null {
  const own = COLOR_PALETTE.find((c) => c.id === config.color);
  if (own) return own.value;
  return ENVIRONMENTS.find((e) => e.id === config.environment)?.color ?? null;
}

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
  /** The `DataGroup` it is filed under, or `null`. */
  groupId: string | null;
  environment: Environment | null;
  /** An id from `COLOR_PALETTE`; `null` follows the environment. */
  color: string | null;
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
    groupId: null,
    environment: null,
    color: null,
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
    groupId: text(v.groupId),
    environment: ENVIRONMENTS.some((e) => e.id === v.environment) ? (v.environment as Environment) : null,
    color: COLOR_PALETTE.some((c) => c.id === v.color) ? (v.color as string) : null,
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
