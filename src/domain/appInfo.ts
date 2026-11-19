export interface Author {
  name: string;
  email: string;
  github: string;
}

export interface Credit {
  name: string;
  license: string;
}

export interface AppInfo {
  name: string;
  version: string;
  description: string;
  author: Author;
  credits: Credit[];
}

/** What the About dialog shows. The version comes from the build (`package.json`). */
export function appInfo(version: string): AppInfo {
  return {
    name: 'RustPilot',
    version,
    description: 'A lightweight desktop code editor with a JetBrains-style interface and an AI coding agent on the way.',
    author: {
      name: 'Indra Basuki',
      email: 'indrbasuki1@gmail.com',
      github: 'https://github.com/ibass-0',
    },
    credits: [
      { name: 'Tauri', license: 'MIT / Apache-2.0' },
      { name: 'SolidJS', license: 'MIT' },
      { name: 'CodeMirror', license: 'MIT' },
      { name: 'Material Icon Theme', license: 'MIT' },
    ],
  };
}
