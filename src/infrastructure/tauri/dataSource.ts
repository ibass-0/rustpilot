import type { DataSourcePort } from '../../application/ports';
import type { DataNode } from '../../domain/dataSource';
import type { SqlResult } from '../../domain/sql';
import { call } from './invoke';

export const tauriDataSource: DataSourcePort = {
  test: (config, password) => call<void>('ds_test', { config, password: password ?? null }),
  connect: (config, password) => call<void>('ds_connect', { config, password: password ?? null }),
  saveSecret: (id, password) => call<void>('ds_save_secret', { id, password }),
  forgetSecret: (id) => call<void>('ds_forget_secret', { id }),
  disconnect: (id) => call<void>('ds_disconnect', { id }),
  children: (id, path) => call<DataNode[]>('ds_children', { id, path }),
  consolePath: (id) => call<string>('ds_console_path', { id }),
  execute: (id, executionId, sql) => call<SqlResult>('sql_execute', { id, executionId, sql }),
  cancel: (executionId) => call<void>('sql_cancel', { executionId }),
};
