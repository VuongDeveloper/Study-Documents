import apiClient from './client';
import type {
  WordDefinitionRequest,
  WordDefinitionResponse,
  WordLinkRequest,
  WordGraphResponse,
  PageResponse,
} from '@/types';

export const dictionaryApi = {
  listWords: async (page = 0, size = 20, q?: string) => {
    const res = await apiClient.get<PageResponse<WordDefinitionResponse>>('/dictionary/words', {
      params: { page, size, q },
    });
    return { ...res, data: res.data.content };
  },
  getWord: (id: string) =>
    apiClient.get<WordDefinitionResponse>(`/dictionary/words/${id}`),
  createWord: (data: WordDefinitionRequest) =>
    apiClient.post<WordDefinitionResponse>('/dictionary/words', data),
  updateWord: (id: string, data: WordDefinitionRequest) =>
    apiClient.put<WordDefinitionResponse>(`/dictionary/words/${id}`, data),
  deleteWord: (id: string) =>
    apiClient.delete(`/dictionary/words/${id}`),
  getParents: (id: string) =>
    apiClient.get<WordDefinitionResponse[]>(`/dictionary/words/${id}/parents`),
  getChildren: (id: string) =>
    apiClient.get<WordDefinitionResponse[]>(`/dictionary/words/${id}/children`),
  getRoots: () =>
    apiClient.get<WordDefinitionResponse[]>('/dictionary/roots'),
  getGraph: async () => {
    const res = await apiClient.get<WordGraphResponse>('/dictionary/graph');
    return { ...res, data: res.data.children };
  },
  createLink: (data: WordLinkRequest) =>
    apiClient.post('/dictionary/links', data),
  deleteLink: (id: string) =>
    apiClient.delete(`/dictionary/links/${id}`),
  updateLinkPosition: (id: string, position: number) =>
    apiClient.patch(`/dictionary/links/${id}`, { position }),
};
