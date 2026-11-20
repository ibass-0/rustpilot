import type { DockerPort, DockerContainer, DockerImage, DockerInfo } from '../../domain/docker';
import { call } from './invoke';
export const tauriDocker: DockerPort = {
  info: () => call<DockerInfo>('docker_info'),
  containers: (all = true) => call<DockerContainer[]>('docker_containers', { all }),
  images: () => call<DockerImage[]>('docker_images'),
  start: (id) => call<void>('docker_action', { action: 'start', id }),
  stop: (id) => call<void>('docker_action', { action: 'stop', id }),
  restart: (id) => call<void>('docker_action', { action: 'restart', id }),
  logs: (id, tail = 200) => call<string>('docker_logs', { id, tail }),
  exec: (id, command) => call<string>('docker_exec', { id, command }),
};
