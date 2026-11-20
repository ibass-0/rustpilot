export interface DockerContainer { id: string; name: string; image: string; state: string; status: string; ports: string; project?: string; service?: string; }
export interface DockerImage { id: string; repository: string; tag: string; size: string; created: string; }
export interface DockerResource { id: string; name: string; driver?: string; scope?: string; }
export interface DockerInfo { version: string; server: string; containers: number; images: number; }
export interface DockerPort { info(): Promise<DockerInfo>; containers(all?: boolean): Promise<DockerContainer[]>; images(): Promise<DockerImage[]>; volumes(): Promise<DockerResource[]>; networks(): Promise<DockerResource[]>; start(id: string): Promise<void>; stop(id: string): Promise<void>; restart(id: string): Promise<void>; logs(id: string, tail?: number): Promise<string>; exec(id: string, command: string): Promise<string>; }
