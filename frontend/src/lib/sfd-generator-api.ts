const BASE_URL =
  process.env.NEXT_PUBLIC_SFD_API_URL ?? 'http://localhost:8004';

export const SFD_GENERATOR_API = {
  baseUrl: BASE_URL,

  endpoints: {
    init: '/api/sfd-generator/init',
    progress: (id: string) => `/api/sfd-generator/progress/${id}`,
    chat: (id: string) => `/api/sfd-generator/chat/${id}`,
    session: (id: string) => `/api/sfd-generator/session/${id}`,
    preview: (id: string) => `/api/sfd-generator/preview/${id}`,
    export: (id: string) => `/api/sfd-generator/export/${id}`,
    validate: (id: string, section: string) =>
      `/api/sfd-generator/validate/${id}/${section}`,
    delete: (id: string) => `/api/sfd-generator/session/${id}`,
    health: '/api/sfd-generator/health',
    style: (id: string) => `/api/sfd-generator/style/${id}`,    // POST { style }
    themes: '/api/sfd-generator/themes',                         // GET
    patch: (id: string) => `/api/sfd-generator/patch/${id}`,    // PATCH { path, value }
  },

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  },
};