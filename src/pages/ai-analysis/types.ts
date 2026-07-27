import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Analysis, AIAnalysisResult, Client, GalleryItem } from '../../db';
import type { TabId } from './constants';

export type { TabId };

export interface AISessionApi {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedClient: string;
  setSelectedClient: (id: string) => void;
  clientGallery: GalleryItem[];
  selectedImage: GalleryItem | null;
  analyzing: boolean;
  result: AIAnalysisResult | null;
  error: string;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  viewingAnalysis: Analysis | null;
  isReadOnly: boolean;
  filteredClients: Client[];
  clientHistory: Analysis[];
  aiAnalyses: Analysis[];
  clients: Client[];
  hasApiKey: boolean;
  canvasRef: RefObject<HTMLCanvasElement>;
  imgRef: RefObject<HTMLImageElement>;
  selectImage: (item: GalleryItem) => Promise<void>;
  analyzeWithGemini: () => Promise<void>;
  cancelAnalysis: () => void;
  loadAnalysisForView: (analysis: Analysis) => void;
  handleDelete: (analysisId: string) => Promise<void>;
  resetForm: () => void;
  downloadResult: () => void;
  getSelectedClient: () => Client | undefined;
}
