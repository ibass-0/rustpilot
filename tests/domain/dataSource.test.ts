import { describe, expect, test } from 'vitest';
import {
  defaultName,
  defaultPort,
  describeTarget,
  isServerEngine,
  newConfig,
  nodeKey,
  normalizeConfig,
  sqlDialect,
  validateConfig,
  type DataSourceConfig,
} from '../../src/domain/dataSource';

const sqlite = (patch: Partial<DataSourceConfig> = {}): DataSourceConfig => ({
  ...newConfig('sqlite', 'a1'),
  name: 'Shop',
  filePath: 'C:\\data\\shop.db',
  ...patch,
});

const server = (patch: Partial<DataSourceConfig> = {}): DataSourceConfig => ({
  ...newConfig('postgres', 'p1'),
  name: 'Prod',
  host: 'db.example.com',
  user: 'app',
  ...patch,
});

describe('validateConfig', () => {
  test('accepts a complete SQLite source', () => {
    expect(validateConfig(sqlite())).toBeNull();
  });

  test('needs a name', () => {
    expect(validateConfig(sqlite({ name: '  ' }))).toBe('Enter a name.');
  });

  test('needs a file for SQLite', () => {
    expect(validateConfig(sqlite({ filePath: null }))).toBe('Choose a database file.');
    expect(validateConfig(sqlite({ filePath: ' ' }))).toBe('Choose a database file.');
  });

  test('accepts a complete server source for every server engine', () => {
    for (const engine of ['postgres', 'mysql', 'mariadb'] as const) {
      expect(validateConfig(server({ engine }))).toBeNull();
    }
  });

  test('a server needs a host and a user', () => {
    expect(validateConfig(server({ host: null }))).toBe('Enter a host.');
    expect(validateConfig(server({ host: '  ' }))).toBe('Enter a host.');
    expect(validateConfig(server({ user: '' }))).toBe('Enter a user.');
  });

  test('a port must be between 1 and 65535 when given', () => {
    expect(validateConfig(server({ port: 0 }))).toBe('Enter a port between 1 and 65535.');
    expect(validateConfig(server({ port: 70000 }))).toBe('Enter a port between 1 and 65535.');
    expect(validateConfig(server({ port: 1.5 }))).toBe('Enter a port between 1 and 65535.');
    expect(validateConfig(server({ port: 5433 }))).toBeNull();
    expect(validateConfig(server({ port: null }))).toBeNull();
  });

  test('rejects engines that are not built yet', () => {
    expect(validateConfig(server({ engine: 'mssql' }))).toBe('SQL Server is not supported yet.');
    expect(validateConfig(server({ engine: 'redis' }))).toBe('Redis is not supported yet.');
  });
});

describe('engines', () => {
  test('server engines are told apart from SQLite', () => {
    expect(isServerEngine('postgres')).toBe(true);
    expect(isServerEngine('mysql')).toBe(true);
    expect(isServerEngine('mariadb')).toBe(true);
    expect(isServerEngine('sqlite')).toBe(false);
  });

  test('default ports', () => {
    expect(defaultPort('postgres')).toBe(5432);
    expect(defaultPort('mysql')).toBe(3306);
    expect(defaultPort('mariadb')).toBe(3306);
    expect(defaultPort('sqlite')).toBeNull();
  });

  test('the SQL dialect follows the engine', () => {
    expect(sqlDialect('sqlite')).toBe('sqlite');
    expect(sqlDialect('postgres')).toBe('postgres');
    expect(sqlDialect('mysql')).toBe('mysql');
    expect(sqlDialect('mariadb')).toBe('mariadb');
  });
});

describe('newConfig', () => {
  test('a server starts on localhost with SSL preferred and the password not saved', () => {
    expect(newConfig('postgres', 'x1')).toMatchObject({
      id: 'x1',
      engine: 'postgres',
      host: 'localhost',
      port: null,
      user: '',
      sslMode: 'prefer',
      savePassword: false,
      filePath: null,
    });
  });

  test('SQLite has no server settings', () => {
    expect(newConfig('sqlite', 'x1')).toMatchObject({ host: null, user: null, filePath: null });
  });
});

describe('normalizeConfig', () => {
  test('fills the settings a config saved by an older version lacks', () => {
    const old = { id: 'a1', name: 'Shop', engine: 'sqlite', filePath: 'C:/shop.db', readOnly: true };
    expect(normalizeConfig(old)).toEqual({
      id: 'a1',
      name: 'Shop',
      engine: 'sqlite',
      filePath: 'C:/shop.db',
      readOnly: true,
      host: null,
      port: null,
      database: null,
      user: null,
      sslMode: 'prefer',
      savePassword: false,
      groupId: null,
      environment: null,
      color: null,
    });
  });

  test('keeps what is there and rejects what is not a config', () => {
    const full = server({ port: 5433, database: 'shop', sslMode: 'require', savePassword: true });
    expect(normalizeConfig(full)).toEqual(full);
    expect(normalizeConfig(null)).toBeNull();
    expect(normalizeConfig({ id: 1 })).toBeNull();
    expect(normalizeConfig({ ...full, engine: 'nope' })).toBeNull();
    expect(normalizeConfig({ ...full, sslMode: 'sometimes' })?.sslMode).toBe('prefer');
  });
});

describe('describeTarget', () => {
  test('shows the SQLite file', () => {
    expect(describeTarget(sqlite())).toBe('C:\\data\\shop.db');
  });

  test('shows user, host, port and database, never a password', () => {
    expect(describeTarget(server({ port: 5433, database: 'shop' }))).toBe('app@db.example.com:5433/shop');
    expect(describeTarget(server())).toBe('app@db.example.com:5432');
    expect(describeTarget(server({ engine: 'mysql', host: 'h' }))).toBe('app@h:3306');
  });
});

describe('defaultName', () => {
  test('uses the file name without its extension', () => {
    expect(defaultName(sqlite())).toBe('shop');
    expect(defaultName(sqlite({ filePath: '/home/me/app.sqlite3' }))).toBe('app');
  });

  test('uses the host for a server', () => {
    expect(defaultName(server())).toBe('db.example.com');
  });

  test('falls back to the engine name', () => {
    expect(defaultName(sqlite({ filePath: null }))).toBe('SQLite');
    expect(defaultName(server({ host: null }))).toBe('PostgreSQL');
  });
});

describe('nodeKey', () => {
  test('is stable and distinguishes paths', () => {
    expect(nodeKey([])).toBe('');
    expect(nodeKey(['main', 'tables'])).toBe(nodeKey(['main', 'tables']));
    expect(nodeKey(['a/b', 'c'])).not.toBe(nodeKey(['a', 'b/c']));
  });
});
