import apiClient from './client';
import type {
  WordDefinitionRequest,
  WordDefinitionResponse,
  WordLinkRequest,
  WordGraphResponse,
} from '@/types';

export const dictionaryApi = {
  listWords: (page = 0, size = 20, q?: string) =>
    apiClient.get<WordDefinitionResponse[]>('/dictionary/words', { params: { page, size, q } }),
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
  getGraph: () =>
    apiClient.get<WordGraphResponse[]>('/dictionary/graph'),
  createLink: (data: WordLinkRequest) =>
    apiClient.post('/dictionary/links', data),
  deleteLink: (id: string) =>
    apiClient.delete(`/dictionary/links/${id}`),
  updateLinkPosition: (id: string, position: number) =>
    apiClient.patch(`/dictionary/links/${id}`, { position }),
};
