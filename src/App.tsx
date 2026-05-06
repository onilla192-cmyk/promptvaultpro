/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Settings, FileEdit, ChevronLeft, ChevronRight, 
  Trash2, Copy, Save, Share, Eye, EyeOff, Search,
  Star, LayoutGrid, List, Smartphone, Lock, Unlock,
  RotateCcw, RotateCw, Image as ImageIcon, Camera,
  Video, Folder as FolderIcon, X, Check, Cloud, Download,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Move, Menu, Scissors, Filter, Images, CheckSquare, Ban, Maximize2, Minimize2, FolderPlus
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import confetti from 'canvas-confetti';
import { cn, sfx } from './lib/utils';

// --- Types ---
interface Media {
  type: 'image' | 'video';
  data: string;
}

interface PanPosition {
  x: number;
  y: number;
  zoom: number;
}

interface Prompt {
  text: string;
  media: Media[];
  isFavorite: boolean;
  isExcluded?: boolean;
  excludeFromGroupStack?: boolean;
  isGroupCover?: boolean;
  isDuplicate: boolean;
  tags: string[];
  cardHidden: boolean;
  panPositions: Record<number, PanPosition>;
  createdAt?: number;
  generator?: string;
  group?: string;
}

interface Folder {
  thumb: string | null;
  prompts: Record<string, Prompt>;
  layout: 'grid' | 'list';
  hidden: boolean;
  icon?: string;
  panPosition?: PanPosition;
  groups?: string[];
}

type VaultData = Record<string, Folder>;

interface TrashItem {
  id: string;
  type: 'folder' | 'prompt';
  name: string;
  folderName?: string;
  data: Folder | Prompt;
  deletedAt: number;
}

interface MassAddImage {
  name: string;
  data: string;
  type: 'image' | 'video';
}

// --- Constants ---
const MAX_MEDIA = 12;
const STORAGE_KEY = 'prompt_vault_v2';
const TRASH_KEY = 'prompt_vault_trash_v1';
const PRESET_KEY = 'vault_presets_v1';

const GENERATORS = ['Gemini', 'ChatGPT', 'Grok', 'Midjourney', 'DALL-E', 'Stable Diffusion', 'Omni AI'];
const GENERATOR_COLORS: Record<string, string> = {
  'Gemini': 'bg-blue-900 border-blue-500/50 text-blue-300',
  'ChatGPT': 'bg-green-900 border-green-500/50 text-green-300',
  'Grok': 'bg-red-900 border-red-500/50 text-red-300',
  'Midjourney': 'bg-slate-800 border-slate-400/50 text-slate-300',
  'DALL-E': 'bg-yellow-900 border-yellow-500/50 text-yellow-300',
  'Stable Diffusion': 'bg-purple-900 border-purple-500/50 text-purple-300',
  'Omni AI': 'bg-cyan-900 border-cyan-500/50 text-cyan-300'
};

function MassContentEditItem({ 
  initialTitle, 
  initialText, 
  media,
  onSave, 
  onRemove 
}: { 
  initialTitle: string; 
  initialText: string; 
  media: Media[];
  onSave: (newTitle: string, newText: string) => void;
  onRemove: () => void;
  key?: React.Key;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText);

  const handleSave = () => {
    sfx.tap();
    onSave(title, text);
    setExpanded(false);
  };

  const handleCancelLocal = () => {
    sfx.tap();
    setTitle(initialTitle); 
    setText(initialText);
    setExpanded(false);
  };

  return (
    <div className={cn("bg-[#111] border border-white/10 rounded-2xl overflow-hidden flex flex-col transition-all shrink-0", expanded && "shadow-xl shadow-black/80 ring-1 ring-primary/30")}>
      <div className="p-4 flex items-center gap-4">
        {media[0] ? (
           <div className="w-12 h-12 rounded-lg bg-black overflow-hidden shrink-0 border border-white/5">
             {media[0].type === 'image' ? (
                <img src={media[0].data} className="w-full h-full object-cover object-[center_20%]" />
             ) : (
                <video src={media[0].data} className="w-full h-full object-cover object-[center_20%]" />
             )}
           </div>
        ) : (
           <div className="w-12 h-12 rounded-lg bg-[#0a0a0a] border border-white/5 flex items-center justify-center shrink-0">
             <ImageIcon size={16} className="text-white/20" />
           </div>
        )}
        <div className="flex-1 min-w-0">
          <input 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => {
              if(!expanded) sfx.open();
              setExpanded(true);
            }}
            className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/30 overflow-hidden text-ellipsis"
            placeholder="Prompt Title"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          {expanded ? (
            <>
              <button title="Save Edit" onClick={handleSave} className="p-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-full transition-colors"><Check size={16} /></button>
              <button title="Cancel Edit" onClick={handleCancelLocal} className="p-2 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white rounded-full transition-colors"><X size={16} /></button>
            </>
          ) : (
            <button title="Remove from Mass Edit" onClick={onRemove} className="p-2 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white rounded-full transition-colors"><X size={16} /></button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="p-4 border-t border-white/5 bg-[#0a0a0a]">
          <textarea 
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-transparent text-xs text-white/70 outline-none resize-none leading-relaxed placeholder:text-white/30"
            rows={4}
            placeholder="Prompt Content..."
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

export default function App() {
  // --- Global State ---
  const [data, setData] = useState<VaultData>({});
  const [trashData, setTrashData] = useState<TrashItem[]>([]);

  const persistData = useCallback(async (newData: VaultData) => {
    setData(newData);
    await set(STORAGE_KEY, newData);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
    } catch (e) {
      console.warn('LocalStorage quota exceeded, using IndexedDB only');
    }
  }, []);

  const persistTrash = useCallback(async (newTrash: TrashItem[]) => {
    setTrashData(newTrash);
    await set(TRASH_KEY, newTrash);
    try {
      localStorage.setItem(TRASH_KEY, JSON.stringify(newTrash));
    } catch (e) {
      console.warn('LocalStorage quota exceeded, using IndexedDB only');
    }
  }, []);

  const [currentFolderName, setCurrentFolderName] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedFolderForOpening, setSelectedFolderForOpening] = useState<string | null>(null);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [view, setView] = useState<'home' | 'folder'>('home');
  const [isEditMode, setIsEditMode] = useState(false);
  const [revealHidden, setRevealHidden] = useState(false);
  const [revealHiddenCards, setRevealHiddenCards] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cardFilter, setCardFilter] = useState<'all' | 'favorites' | 'default'>('all');
  const [cardSort, setCardSort] = useState<'custom' | 'alpha-asc' | 'alpha-desc' | 'date-asc' | 'date-desc'>('custom');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [homeLayout, setHomeLayout] = useState<'grid' | 'list' | 'gallery'>('grid');
  const [cardAnimation, setCardAnimation] = useState<'flip' | 'fade' | 'slide-up' | 'scale' | 'none'>('none');
  const [showReorderArrows, setShowReorderArrows] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set());
  const [selectedTrashItems, setSelectedTrashItems] = useState<Set<string>>(new Set());
  const [isTrashMultiSelectMode, setIsTrashMultiSelectMode] = useState(false);
  const [showMassEditDialog, setShowMassEditDialog] = useState(false);
  const [showMassContentDialog, setShowMassContentDialog] = useState(false);
  const [massContentDrafts, setMassContentDrafts] = useState<Record<string, { newTitle: string; newText: string }>>({});
  const [massEditTags, setMassEditTags] = useState<string[]>([]);
  const [massEditGenerator, setMassEditGenerator] = useState<string | undefined>();
  const [massEditGroup, setMassEditGroup] = useState<string | undefined>();
  
  // --- UI State ---
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [massAddOpen, setMassAddOpen] = useState(false);
  const [massAddItems, setMassAddItems] = useState<MassAddImage[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [bgColor, setBgColor] = useState('#000000');
  const [bgImage, setBgImage] = useState<string | null>(null);
  
  // --- Editor State ---
  const [editorOpen, setEditorOpen] = useState(false);
  const [activePromptName, setActivePromptName] = useState<string | null>(null);
  const [editTitle, setEditorTitle] = useState('');
  const [editText, setEditorText] = useState('');
  const [editMedia, setEditorMedia] = useState<Media[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [editTags, setEditorTags] = useState<string[]>([]);
  const [editGenerator, setEditGenerator] = useState<string | undefined>();
  const [editGroup, setEditorGroup] = useState<string | undefined>();
  const [editExcludeFromGroupStack, setEditExcludeFromGroupStack] = useState(false);
  const [editIsGroupCover, setEditIsGroupCover] = useState(false);
  const [autoCollapse, setAutoCollapse] = useState(true);
  const [isPanMode, setIsPanMode] = useState(false);
  const [panBoxSize, setPanBoxSize] = useState(250);
  const [editPanPositions, setEditPanPositions] = useState<Record<number, PanPosition>>({});
  const panDragRef = useRef<{ startX: number, startY: number, initialPanX: number, initialPanY: number } | null>(null);

  const startPanDrag = (e: React.PointerEvent) => {
    if (!isPanMode) return;
    const currentPan = editPanPositions[activeMediaIndex] || { x: 50, y: 50, zoom: 1 };
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPanX: currentPan.x,
      initialPanY: currentPan.y
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePanDrag = (e: React.PointerEvent) => {
    if (!isPanMode || !panDragRef.current) return;
    const dx = e.clientX - panDragRef.current.startX;
    const dy = e.clientY - panDragRef.current.startY;
    
    const sens = 0.3;
    const newX = Math.max(0, Math.min(100, panDragRef.current.initialPanX - dx * sens));
    const newY = Math.max(0, Math.min(100, panDragRef.current.initialPanY - dy * sens));
    
    setEditPanPositions(prev => ({
       ...prev,
       [activeMediaIndex]: { ...(prev[activeMediaIndex] || { zoom: 1 }), x: newX, y: newY }
    }));
  };

  const endPanDrag = (e: React.PointerEvent) => {
    if (panDragRef.current) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        panDragRef.current = null;
    }
  };

  const [activeFolderMenu, setActiveFolderMenu] = useState<string | null>(null);
  const [isFolderPanMode, setIsFolderPanMode] = useState(false);
  const [folderPanTemp, setFolderPanTemp] = useState<PanPosition | null>(null);
  const folderPanDragRef = useRef<{ startX: number, startY: number, initialPanX: number, initialPanY: number } | null>(null);

  const startFolderPanDrag = (e: React.PointerEvent) => {
    if (!isFolderPanMode || !activeFolderMenu) return;
    const currentPan = folderPanTemp || data[activeFolderMenu]?.panPosition || { x: 50, y: 50, zoom: 1 };
    folderPanDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPanX: currentPan.x,
      initialPanY: currentPan.y
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleFolderPanDrag = (e: React.PointerEvent) => {
    if (!isFolderPanMode || !folderPanDragRef.current || !activeFolderMenu) return;
    const dx = e.clientX - folderPanDragRef.current.startX;
    const dy = e.clientY - folderPanDragRef.current.startY;
    
    const sens = 0.3;
    const newX = Math.max(0, Math.min(100, folderPanDragRef.current.initialPanX - dx * sens));
    const newY = Math.max(0, Math.min(100, folderPanDragRef.current.initialPanY - dy * sens));
    
    const currentPan = folderPanTemp || data[activeFolderMenu]?.panPosition || { x: 50, y: 50, zoom: 1 };
    setFolderPanTemp({ ...currentPan, x: newX, y: newY });
  };

  const endFolderPanDrag = (e: React.PointerEvent) => {
    if (folderPanDragRef.current) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        folderPanDragRef.current = null;
    }
  };

  const saveFolderPanTemp = useCallback(() => {
    if (activeFolderMenu && folderPanTemp) {
      persistData({
        ...data,
        [activeFolderMenu]: { ...data[activeFolderMenu], panPosition: folderPanTemp }
      });
      sfx.save();
    }
    setIsFolderPanMode(false);
    setFolderPanTemp(null);
  }, [activeFolderMenu, folderPanTemp, data, persistData]);

  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);
  const touchStartY = useRef<number>(0);
  const longPressedThisClick = useRef<boolean>(false);

  const startLongPress = useCallback((e: React.PointerEvent | React.TouchEvent, name: string) => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    const clientY = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientY : ('clientY' in e ? e.clientY : 0);
    touchStartY.current = clientY;
    longPressedThisClick.current = false;
    longPressTimeout.current = setTimeout(() => {
      longPressedThisClick.current = true;
      setActiveFolderMenu(name);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 750);
  }, []);

  const cancelLongPress = useCallback((e?: React.PointerEvent | React.TouchEvent) => {
    if (!e || e.type === 'pointerup' || e.type === 'pointerleave' || e.type === 'pointercancel' || e.type === 'touchend' || e.type === 'touchcancel') {
      if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    } else if ('clientY' in e || 'touches' in e) {
      const clientY = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientY : ('clientY' in e ? (e as any).clientY : 0);
      if (clientY && Math.abs(clientY - touchStartY.current) > 10) {
        if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
      }
    }
  }, []);

  const [clipboard, setClipboard] = useState<{
    action: 'cut' | 'copy';
    sourceFolder: string;
    promptName: string;
    prompt: Prompt;
  } | null>(null);
  
  // --- Initialization ---
  useEffect(() => {
    async function loadData() {
      const stored = await get(STORAGE_KEY);
      if (stored) {
        setData(stored);
      } else {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          setData(parsed);
          await set(STORAGE_KEY, parsed);
        }
      }
    }
    loadData();

    async function loadTrash() {
      const stored = await get(TRASH_KEY);
      if (stored) {
        setTrashData(stored);
      } else {
        const legacy = localStorage.getItem(TRASH_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          setTrashData(parsed);
          await set(TRASH_KEY, parsed);
        }
      }
    }
    loadTrash();
  }, []);

  // --- Folder Logic ---
  const handleCreateFolder = useCallback(async () => {
    const name = await showPrompt('New Folder', 'Enter folder name:');
    if (name && !data[name]) {
      const newData = {
        ...data,
        [name]: { thumb: null, prompts: {}, layout: 'grid', hidden: false }
      };
      persistData(newData);
      sfx.save();
    }
  }, [data, persistData]);

  const setFolderThumb = useCallback((folderName: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 400;
          let w = img.width, h = img.height;
          if (w > h) { if(w > MAX) { h *= MAX/w; w = MAX; } }
          else { if(h > MAX) { w *= MAX/h; h = MAX; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
          const thumb = canvas.toDataURL('image/jpeg', 0.8);
          persistData({
            ...data,
            [folderName]: { ...data[folderName], thumb }
          });
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [data, persistData]);

  // --- Navigation ---
  const openFolder = (name: string) => {
    setCurrentFolderName(name);
    setView('folder');
    setSearchQuery('');
    sfx.open();
  };

  const goHome = () => {
    setView('home');
    setCurrentFolderName(null);
    setSelectedGroup(null);
    setEditorOpen(false);
    setIsEditMode(false);
    sfx.close();
  };

  // --- Prompt Logic ---
  const openEditor = (promptName?: string) => {
    setIsPanMode(false);
    if (promptName && currentFolderName) {
      const p = data[currentFolderName].prompts[promptName];
      setActivePromptName(promptName);
      setEditorTitle(promptName);
      setEditorText(p.text);
      setEditorMedia([...p.media]);
      setActiveMediaIndex(0);
      setEditorTags([...p.tags]);
      setEditGenerator(p.generator);
      setEditorGroup(p.group);
      setEditExcludeFromGroupStack(p.excludeFromGroupStack || false);
      setEditIsGroupCover(p.isGroupCover || false);
      setEditPanPositions(p.panPositions || {});
    } else {
      setActivePromptName(null);
      setEditorTitle('');
      setEditorText('');
      setEditorMedia([]);
      setActiveMediaIndex(0);
      setEditorTags([]);
      setEditGenerator(undefined);
      setEditorGroup(undefined);
      setEditExcludeFromGroupStack(false);
      setEditIsGroupCover(false);
      setEditPanPositions({});
    }
    setEditorOpen(true);
    sfx.open();
  };

  const handleSavePrompt = useCallback(() => {
    if (!currentFolderName || !editTitle.trim()) return;

    const folder = data[currentFolderName];
    const newPrompt: Prompt = {
      text: editText,
      media: editMedia,
      isFavorite: activePromptName ? folder.prompts[activePromptName]?.isFavorite : false,
      isExcluded: activePromptName ? folder.prompts[activePromptName]?.isExcluded : false,
      isDuplicate: false,
      tags: editTags,
      cardHidden: activePromptName ? folder.prompts[activePromptName]?.cardHidden : false,
      panPositions: editPanPositions,
      createdAt: activePromptName ? (folder.prompts[activePromptName]?.createdAt || Date.now()) : Date.now(),
      generator: editGenerator,
      group: editGroup,
      excludeFromGroupStack: editExcludeFromGroupStack,
      isGroupCover: editIsGroupCover
    };

    const newPrompts = { ...folder.prompts };
    if (activePromptName && activePromptName !== editTitle) {
      delete newPrompts[activePromptName];
    }
    newPrompts[editTitle] = newPrompt;

    persistData({
      ...data,
      [currentFolderName]: { ...folder, prompts: newPrompts }
    });

    if (autoCollapse) setEditorOpen(false);
    sfx.save();
    confetti({
      particleCount: 40,
      spread: 70,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#ffffff']
    });
  }, [data, currentFolderName, editTitle, editText, editMedia, editTags, editGenerator, activePromptName, autoCollapse, persistData, editPanPositions, editGroup, editExcludeFromGroupStack, editIsGroupCover]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).slice(0, MAX_MEDIA - editMedia.length).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const type = file.type.startsWith('video') ? 'video' : 'image';
        setEditorMedia(prev => [...prev, { type, data: ev.target?.result as string }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const processMassAddFiles = (files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setMassAddItems(prev => [...prev, {
          name: file.name.replace(/\.[^/.]+$/, ""), // remove extension
          data: dataUrl,
          type: file.type.startsWith('video/') ? 'video' : 'image'
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleMassAddDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      processMassAddFiles(Array.from(e.dataTransfer.files));
    }
  };
  
  const handleMassAddUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processMassAddFiles(Array.from(e.target.files));
    }
  };

  const confirmMassAdd = () => {
    if (massAddItems.length === 0) return;

    let folderName = 'Imported';
    let counter = 1;
    let finalFolderName = folderName;
    while (data[finalFolderName]) {
      finalFolderName = `${folderName} (${counter})`;
      counter++;
    }

    const newFolder: Folder = {
      thumb: null,
      prompts: {},
      layout: 'grid',
      hidden: false,
      icon: 'download'
    };

    massAddItems.forEach((item, index) => {
      let promptName = item.name || `Image ${index + 1}`;
      let pCounter = 1;
      let finalPromptName = promptName;
      while (newFolder.prompts[finalPromptName]) {
        finalPromptName = `${promptName} (${pCounter})`;
        pCounter++;
      }
      
      newFolder.prompts[finalPromptName] = {
        text: '',
        media: [{ type: item.type, data: item.data }],
        isFavorite: false,
        isDuplicate: false,
        tags: [],
        cardHidden: false,
        panPositions: {},
        createdAt: Date.now() + index
      };
    });

    persistData({
      ...data,
      [finalFolderName]: newFolder
    });

    setMassAddItems([]);
    setMassAddOpen(false);
    sfx.save();
    setCurrentFolderName(finalFolderName);
    setView('folder');
  };

  const applyMassEdit = () => {
    if (!currentFolderName) return;
    const newPrompts = { ...data[currentFolderName].prompts };
    selectedPrompts.forEach(name => {
       if (newPrompts[name]) {
          newPrompts[name] = { 
             ...newPrompts[name],
             ...(massEditGenerator !== undefined && { generator: massEditGenerator === 'none' ? undefined : massEditGenerator }),
             ...(massEditGroup !== undefined && { 
               group: massEditGroup === 'none' ? undefined : massEditGroup,
               isGroupCover: false,
               excludeFromGroupStack: false
             }),
             tags: Array.from(new Set([...newPrompts[name].tags, ...massEditTags]))
          };
       }
    });
    persistData({
       ...data,
       [currentFolderName]: {
          ...data[currentFolderName],
          prompts: newPrompts
       }
    });
    setShowMassEditDialog(false);
    setIsMultiSelectMode(false);
    setSelectedPrompts(new Set());
    setMassEditTags([]);
    setMassEditGenerator(undefined);
    setMassEditGroup(undefined);
    sfx.save();
  };

  const handleMassGroupSelect = (groupName: string) => {
    if (!currentFolderName || selectedPrompts.size === 0) return;
    const newPrompts = { ...data[currentFolderName].prompts };
    selectedPrompts.forEach(name => {
       if (newPrompts[name]) {
          newPrompts[name] = { 
             ...newPrompts[name],
             group: groupName === 'none' ? undefined : groupName,
             isGroupCover: false,
             excludeFromGroupStack: false
          };
       }
    });
    persistData({
       ...data,
       [currentFolderName]: {
          ...data[currentFolderName],
          prompts: newPrompts
       }
    });
    sfx.save();
    setIsMultiSelectMode(false);
    setSelectedPrompts(new Set());
    setMassEditGroup(undefined);
  };

  const applyMassContentEdit = () => {
    if (!currentFolderName) return;
    const newPrompts = { ...data[currentFolderName].prompts };
    let hasChanges = false;
    
    Array.from<string>(selectedPrompts).forEach((oldName) => {
       const draft = massContentDrafts[oldName];
       if (draft) {
          const oldPrompt = newPrompts[oldName];
          if (oldPrompt) {
            hasChanges = true;
            delete newPrompts[oldName];
            const finalTitle = draft.newTitle.trim() || oldName;
            newPrompts[finalTitle] = {
               ...oldPrompt,
               text: draft.newText
            };
          }
       }
    });

    if (hasChanges) {
      persistData({
        ...data,
        [currentFolderName]: { ...data[currentFolderName], prompts: newPrompts }
      });
      sfx.save();
      confetti({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.8 },
        colors: ['#6366f1', '#ffffff']
      });
    }

    setShowMassContentDialog(false);
    setIsMultiSelectMode(false);
    setSelectedPrompts(new Set());
    setMassContentDrafts({});
  };

  useEffect(() => {
    if (showMassContentDialog && currentFolderName) {
      const folder = data[currentFolderName];
      if (folder) {
        const drafts: Record<string, { newTitle: string; newText: string }> = {};
        selectedPrompts.forEach(name => {
          drafts[name] = {
             newTitle: name,
             newText: folder.prompts[name]?.text || ''
          };
        });
        setMassContentDrafts(drafts);
      }
    }
  }, [showMassContentDialog, currentFolderName, selectedPrompts, data]);

  // --- Undo/Redo State ---
  const [history, setHistory] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // --- Paste Tester State ---
  const [pasteTesterOpen, setPasteTesterOpen] = useState(false);
  const [ptActiveTab, setPtActiveTab] = useState(0);
  const [ptTabs, setPtTabs] = useState(Array(5).fill('').map(() => ({ text: '', locked: false })));

  // --- Dialog State ---
  const [dialog, setDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'prompt';
    defaultValue?: string;
    onConfirm: (val?: string) => void;
  }>({ open: false, title: '', message: '', type: 'confirm', onConfirm: () => {} });

  const showConfirm = (title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        open: true, title, message, type: 'confirm',
        onConfirm: (val) => resolve(val === 'yes')
      });
    });
  };

  const showPrompt = (title: string, message: string, defaultValue = '') => {
    return new Promise<string | null>((resolve) => {
      setDialog({
        open: true, title, message, type: 'prompt', defaultValue,
        onConfirm: (val) => resolve(val || null)
      });
    });
  };

  // --- Initialization & Hotkeys ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (editorOpen) handleSavePrompt();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === '/') {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          document.querySelector<HTMLInputElement>('input[placeholder="Search vault..."]')?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorOpen, handleSavePrompt]);

  const recordHistory = useCallback((newData: VaultData) => {
    setHistory(prev => [...prev.slice(-19), JSON.stringify(data)]);
    setRedoStack([]);
  }, [data]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [...r, JSON.stringify(data)]);
    setData(JSON.parse(prev));
    setHistory(h => h.slice(0, -1));
    sfx.collapse();
  }, [history, data]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(h => [...h, JSON.stringify(data)]);
    setData(JSON.parse(next));
    setRedoStack(r => r.slice(0, -1));
    sfx.expand();
  }, [redoStack, data]);

  // --- Paste Tester Pro ---
  const handlePtInput = (val: string) => {
    const newTabs = [...ptTabs];
    newTabs[ptActiveTab].text = val.replace(/```/g, '');
    setPtTabs(newTabs);
  };

  const copyTab = (idx: number) => {
    navigator.clipboard.writeText(ptTabs[idx].text);
    sfx.tap();
  };

  // --- Template UI Parts ---
  const PasteTester = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-4 z-[100] glass rounded-3xl overflow-hidden flex flex-col shadow-2xl p-1"
    >
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex gap-2">
          {ptTabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setPtActiveTab(i)}
              className={cn(
                "w-8 h-8 rounded-lg text-[10px] font-bold transition-all border shrink-0",
                ptActiveTab === i ? "bg-primary border-primary text-black" : "border-white/10 text-white/40 hover:bg-white/5"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button onClick={() => setPasteTesterOpen(false)} className="p-2 text-white/40 hover:text-white"><X size={20}/></button>
      </div>
      
      <div className="flex-1 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-white/30 uppercase tracking-widest">
            <FileEdit size={14} /> Buffer Tab {ptActiveTab + 1}
          </div>
          <span className="text-[10px] font-mono text-primary/60">{ptTabs[ptActiveTab].text.length} chars</span>
        </div>
        <textarea
          value={ptTabs[ptActiveTab].text}
          onChange={(e) => handlePtInput(e.target.value)}
          placeholder="Paste content here to strip code blocks..."
          className="flex-1 bg-black/40 rounded-2xl p-4 text-sm font-mono focus:ring-1 focus:ring-primary/30 outline-none resize-none placeholder:text-white/5"
        />
        <div className="flex gap-3">
          <button 
            onClick={() => handlePtInput('')}
            className="p-4 bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 rounded-xl transition-all"
          >
            <Trash2 size={18} />
          </button>
          <button 
            onClick={() => copyTab(ptActiveTab)}
            className="flex-1 py-4 bg-primary text-black rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <Copy size={16} /> Copy Clean Text
          </button>
        </div>
      </div>
    </motion.div>
  );

  // --- Helpers ---
  const currentFolder = currentFolderName ? data[currentFolderName] : null;
  const filteredPrompts = Object.entries(currentFolder?.prompts || {} as Record<string, Prompt>)
    .filter(([name, p]: [string, any]) => {
      const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = cardFilter === 'all' || (cardFilter === 'favorites' && p.isFavorite) || (cardFilter === 'default' && !p.isFavorite);
      const matchesTags = activeTagFilters.length === 0 || activeTagFilters.some((t: string) => p.tags.includes(t));
      const matchesHidden = revealHiddenCards || !p.cardHidden;
      return matchesSearch && matchesFilter && matchesTags && matchesHidden;
    })
    .sort((a: [string, any], b: [string, any]) => {
        if (showReorderArrows) return 0; // Disable favorite sort when reordering
        
        const favDiff = (b[1].isFavorite ? 1 : 0) - (a[1].isFavorite ? 1 : 0);
        if (favDiff !== 0) return favDiff; // Favorites always at top

        if (cardSort === 'alpha-asc') {
          return a[0].localeCompare(b[0]);
        } else if (cardSort === 'alpha-desc') {
          return b[0].localeCompare(a[0]);
        } else if (cardSort === 'date-asc') {
          return (a[1].createdAt || 0) - (b[1].createdAt || 0);
        } else if (cardSort === 'date-desc') {
          return (b[1].createdAt || 0) - (a[1].createdAt || 0);
        }
        return 0;
    });

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-500 flex flex-col font-sans relative",
      theme === 'dark' ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
    )} style={{ backgroundColor: bgColor }}>
      
      {/* --- Scanline Animation Effect --- */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] scanline z-50 overflow-hidden" />

      {/* --- Paste Tester Toggle Overlay --- */}
      <AnimatePresence>{pasteTesterOpen && <PasteTester />}</AnimatePresence>
      
      <AnimatePresence>
        {activeFolderMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setActiveFolderMenu(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-sm p-5 flex flex-col shadow-2xl relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
              
              <div className="flex items-center justify-between mb-2 relative z-10">
                <h3 className="font-bold uppercase tracking-widest text-primary/50 text-xs">Folder Options</h3>
                <button onClick={() => setActiveFolderMenu(null)} className="text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>
              
              {activeFolderMenu && data[activeFolderMenu]?.thumb && (
                <div className="w-full aspect-square rounded-2xl overflow-hidden mb-6 relative z-10 shadow-lg border border-white/10 shrink-0 bg-[#0a0a0a] flex items-center justify-center group">
                  {isFolderPanMode ? (
                     <div className="relative w-full h-full bg-[#111] bg-opacity-80 flex items-center justify-center">
                        <div 
                           className="relative outline outline-2 outline-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.8)] overflow-hidden cursor-move transition-all touch-none w-full h-full"
                           onPointerDown={startFolderPanDrag}
                           onPointerMove={handleFolderPanDrag}
                           onPointerUp={endFolderPanDrag}
                           onPointerCancel={endFolderPanDrag}
                        >
                           <img 
                             src={data[activeFolderMenu].thumb!} 
                             className="w-full h-full pointer-events-none" 
                             style={{ 
                               objectFit: 'cover',
                               objectPosition: `${(folderPanTemp || data[activeFolderMenu].panPosition)?.x ?? 50}% ${(folderPanTemp || data[activeFolderMenu].panPosition)?.y ?? 50}%`,
                               transform: `scale(${(folderPanTemp || data[activeFolderMenu].panPosition)?.zoom || 1})`
                             }}
                           />
                        </div>
                        <div className="absolute top-4 right-4 flex gap-2">
                           <button onClick={() => { setIsFolderPanMode(false); setFolderPanTemp(null); }} className="px-4 py-2 bg-white/10 text-white rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-white/20">Cancel</button>
                           <button onClick={saveFolderPanTemp} className="px-4 py-2 bg-primary text-black rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-primary/90">Save</button>
                        </div>
                     </div>
                  ) : (
                    <>
                      <img 
                        src={data[activeFolderMenu].thumb!} 
                        className="w-full h-full"
                        style={{
                          objectFit: 'cover',
                          objectPosition: data[activeFolderMenu].panPosition ? `${data[activeFolderMenu].panPosition!.x ?? 50}% ${data[activeFolderMenu].panPosition!.y ?? 50}%` : 'center',
                          transform: data[activeFolderMenu].panPosition?.zoom && data[activeFolderMenu].panPosition!.zoom !== 1 ? `scale(${data[activeFolderMenu].panPosition!.zoom})` : undefined
                        }}
                      />
                      <div className="absolute top-3 right-3 flex gap-2 transition-opacity">
                        <button
                          onClick={() => { setIsFolderPanMode(true); setFolderPanTemp(data[activeFolderMenu]?.panPosition || { x: 50, y: 50, zoom: 1 }); }}
                          className="p-2 bg-black/60 text-white rounded-full hover:bg-primary/20 transition-colors backdrop-blur-md shadow-lg opacity-0 group-hover:opacity-100"
                        >
                          <Camera size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              
              {isFolderPanMode && activeFolderMenu && (
                 <div className="mb-6 w-full p-4 bg-[#111] border border-white/5 rounded-xl shadow-lg flex flex-col gap-4 relative z-10 shrink-0">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold flex justify-between">
                        <span>Image Zoom</span>
                        <span>{((folderPanTemp || { zoom: 1 }).zoom).toFixed(1)}x</span>
                      </label>
                      <input 
                        type="range" min="0.5" max="3" step="0.1" 
                        value={(folderPanTemp || { zoom: 1 }).zoom} 
                        onChange={(e) => setFolderPanTemp(prev => ({ ...(prev || { x: 50, y: 50 }), zoom: Number(e.target.value) }))} 
                        className="accent-primary h-1" 
                      />
                    </div>
                 </div>
              )}

              <h4 className="text-2xl font-black text-white mb-6 truncate drop-shadow-lg relative z-10">{activeFolderMenu}</h4>

              <div className="flex flex-col gap-2 relative z-10">
                <button 
                  onClick={() => { setFolderThumb(activeFolderMenu); setActiveFolderMenu(null); }}
                  className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all font-semibold active:scale-95 group"
                >
                  <div className="p-2 rounded-xl bg-white/5 group-hover:bg-primary/20 transition-colors">
                    <ImageIcon size={20} className="text-white/70 group-hover:text-primary transition-colors" />
                  </div>
                  Change Cover Image
                </button>
                
                <button 
                  onClick={async () => {
                    const name = activeFolderMenu;
                    setActiveFolderMenu(null);
                    const newName = await showPrompt("Rename folder", `Rename "${name}":`, name);
                    if (newName && newName !== name && !data[newName]) {
                      const newData = { ...data };
                      newData[newName] = newData[name];
                      delete newData[name];
                      persistData(newData);
                      sfx.save();
                    }
                  }}
                  className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all font-semibold active:scale-95 group"
                >
                  <div className="p-2 rounded-xl bg-white/5 group-hover:bg-blue-500/20 transition-colors">
                    <Settings size={20} className="text-white/70 group-hover:text-blue-500 transition-colors" />
                  </div>
                  Rename Folder
                </button>
                
                <button 
                  onClick={() => {
                    const name = activeFolderMenu;
                    setActiveFolderMenu(null);
                    const newData = { ...data, [name]: { ...data[name], hidden: !data[name].hidden } };
                    persistData(newData);
                    sfx.tap();
                  }}
                  className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all font-semibold active:scale-95 group"
                >
                  <div className="p-2 rounded-xl bg-white/5 group-hover:bg-purple-500/20 transition-colors">
                    <EyeOff size={20} className="text-white/70 group-hover:text-purple-500 transition-colors" />
                  </div>
                  {data[activeFolderMenu]?.hidden ? 'Unhide' : 'Hide'} Folder
                </button>
                
                <div className="h-px bg-white/10 my-2" />

                <button 
                  onClick={async () => {
                    const name = activeFolderMenu;
                    setActiveFolderMenu(null);
                    if(await showConfirm('Delete Folder', `Move "${name}" to Recycle Bin?`)) { 
                      const nd = {...data}; 
                      const folderData = nd[name];
                      delete nd[name]; 
                      persistData(nd); 
                      
                      const newTrashItem: TrashItem = {
                        id: Date.now().toString() + Math.random(),
                        type: 'folder',
                        name,
                        data: folderData,
                        deletedAt: Date.now()
                      };
                      persistTrash([...trashData, newTrashItem]);
                      sfx.deleted(); 
                    }
                  }}
                  className="flex items-center gap-3 p-4 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-2xl transition-all font-semibold active:scale-95 group border border-red-500/10 hover:border-red-500/30"
                >
                  <div className="p-2 rounded-xl bg-red-500/10 group-hover:bg-red-500/20 transition-colors">
                    <Trash2 size={20} className="text-red-400 group-hover:text-red-300 transition-colors" />
                  </div>
                  Delete Folder
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Background Image Layer --- */}
      {bgImage && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img src={bgImage} className="w-full h-full object-cover opacity-60" />
        </div>
      )}

      {/* --- App Header --- */}
      <header className="fixed top-0 left-0 right-0 h-20 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-6 flex items-center justify-between z-40">
        <div className="flex items-center gap-2">
          {view === 'folder' ? (
            <div className="flex items-center gap-2">
              <button onClick={goHome} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <ChevronLeft size={24} />
              </button>
              <h1 className="font-bold text-lg uppercase tracking-tight truncate max-w-[150px]">
                {currentFolderName}
              </h1>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-10 h-10 overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/50 text-slate-950 font-black text-2xl shadow-lg ring-1 ring-primary/30">
                <span>P</span>
                <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%)] bg-[length:200%_100%] animate-[shimmer_2s_infinite]"></div>
              </div>
              <div className="flex flex-col justify-center">
                <h1 className="font-black tracking-[0.15em] text-sm leading-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                  Prompt Vault
                </h1>
                <span className="font-bold text-[9px] tracking-[0.3em] uppercase text-primary">
                  Pro Edition
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={cn("p-2 rounded-lg transition-all", isEditMode ? "bg-primary/20 text-primary border border-primary/40 shadow-[0_0_15px_rgba(0,0,0,0.5)]" : "hover:bg-white/10")}
          >
            <Settings size={20} />
          </button>
          <button 
            onClick={() => setHamburgerOpen(true)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* --- Content Area --- */}
      <main className="flex-1 pt-24 pb-24 px-4 max-w-5xl mx-auto w-full relative z-10">
        {view === 'home' && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center bg-slate-900/50 backdrop-blur-md border border-white/5 p-2 rounded-2xl shadow-lg">
              <h2 className="text-sm font-bold tracking-widest text-white/50 uppercase ml-2">Vaults</h2>
              <div className="flex gap-1 bg-black/40 p-1 rounded-xl">
                <button onClick={() => setShowReorderArrows(!showReorderArrows)} className={cn("p-1.5 rounded-lg transition-colors mr-2", showReorderArrows ? "bg-primary/20 text-primary border border-primary/40 shadow-[0_0_10px_rgba(0,0,0,0.5)]" : "text-white/50 hover:text-white")}>
                  <Move size={16} />
                </button>
                <div className="w-px h-6 bg-white/10 self-center mr-1" />
                <button onClick={() => setHomeLayout('grid')} className={cn("p-1.5 rounded-lg transition-colors", homeLayout === 'grid' ? "bg-white/10 text-primary" : "text-white/50 hover:text-white")}>
                  <LayoutGrid size={16} />
                </button>
                <button onClick={() => setHomeLayout('list')} className={cn("p-1.5 rounded-lg transition-colors", homeLayout === 'list' ? "bg-white/10 text-primary" : "text-white/50 hover:text-white")}>
                  <List size={16} />
                </button>
                <button onClick={() => setHomeLayout('gallery')} className={cn("p-1.5 rounded-lg transition-colors", homeLayout === 'gallery' ? "bg-white/10 text-primary" : "text-white/50 hover:text-white")}>
                  <ImageIcon size={16} />
                </button>
              </div>
            </div>

            <motion.div layout
              className={cn(
              homeLayout === 'grid' && "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6",
              homeLayout === 'list' && "flex flex-col gap-3",
              homeLayout === 'gallery' && "grid grid-cols-1 sm:grid-cols-2 gap-8"
            )}>
              <AnimatePresence>
                {Object.keys(data).map(name => {
                  const folder = data[name];
                  return (revealHidden || !folder.hidden) && (
                    <motion.div
                      layout
                      key={name}
                      id={name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      onTouchStart={(e) => startLongPress(e, name)}
                      onTouchEnd={cancelLongPress}
                      onTouchMove={cancelLongPress}
                      onTouchCancel={cancelLongPress}
                      onPointerDown={(e) => startLongPress(e, name)}
                      onPointerUp={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onPointerMove={cancelLongPress}
                      onContextMenu={(e) => { e.preventDefault(); setActiveFolderMenu(name); }}
                      onClick={() => {
                        // Let the gear icon handle its own clicks if active
                        // But also prevent openFolder if we just long pressed
                        if (longPressedThisClick.current) {
                          longPressedThisClick.current = false;
                          return;
                        }
                        if (isEditMode) {
                          setActiveFolderMenu(name);
                          return;
                        }
                        if (activeFolderMenu === name) return;
                        
                        if (selectedFolderForOpening === name) {
                            if (doubleTapTimeoutRef.current) clearTimeout(doubleTapTimeoutRef.current);
                            setSelectedFolderForOpening(null);
                            openFolder(name);
                        } else {
                            setSelectedFolderForOpening(name);
                            sfx.tap();
                            if (doubleTapTimeoutRef.current) clearTimeout(doubleTapTimeoutRef.current);
                            doubleTapTimeoutRef.current = setTimeout(() => {
                                setSelectedFolderForOpening(null);
                            }, 3000);
                        }
                      }}
                      className={cn(
                        "relative group perspective-1000 cursor-pointer",
                        homeLayout === 'grid' && "aspect-square",
                        homeLayout === 'list' && "h-24",
                        homeLayout === 'gallery' && "aspect-square"
                      )}
                    >
                      <AnimatePresence>
                         {selectedFolderForOpening === name && homeLayout !== 'list' && (
                             <>
                                 <motion.div initial={{ x: 0, scale: 0.95, opacity: 0 }} animate={{ x: 30, y: -10, rotateZ: 8, scale: 0.95, opacity: 0.6 }} exit={{ x: 0, scale: 0.95, opacity: 0, rotateZ: 0 }} className={cn("absolute inset-0 rounded-2xl bg-[#0a0a0a] border border-white/20 z-0", homeLayout === 'grid' && "aspect-square",  homeLayout === 'gallery' && "aspect-square")} />
                                 <motion.div initial={{ x: 0, scale: 0.9, opacity: 0 }} animate={{ x: 60, y: -5, rotateZ: 15, scale: 0.9, opacity: 0.4 }} exit={{ x: 0, scale: 0.9, opacity: 0, rotateZ: 0 }} className={cn("absolute inset-0 rounded-2xl bg-[#0a0a0a] border border-white/10 z-0", homeLayout === 'grid' && "aspect-square",  homeLayout === 'gallery' && "aspect-square")} />
                             </>
                         )}
                      </AnimatePresence>

                      <motion.div 
                         animate={{ rotateZ: selectedFolderForOpening === name && homeLayout !== 'list' ? -8 : 0, scale: selectedFolderForOpening === name ? 1.05 : 1, x: selectedFolderForOpening === name && homeLayout !== 'list' ? -10 : 0, y: selectedFolderForOpening === name && homeLayout !== 'list' ? 10 : 0 }}
                         transition={{ type: "spring", stiffness: 300, damping: 20 }}
                         className={cn(
                           "relative w-full h-full rounded-2xl shadow-2xl overflow-hidden flex select-none bg-slate-900 border border-primary/20 z-10",
                           homeLayout === 'grid' && "flex-col",
                           homeLayout === 'list' && "flex-row",
                           homeLayout === 'gallery' && "flex-col",
                           folder.hidden && "opacity-40 grayscale",
                           selectedFolderForOpening === name && "ring-2 ring-primary ring-offset-2 ring-offset-black"
                         )}
                      >
                      {/* Breathing border */}
                      <div className="absolute inset-0 rounded-2xl border border-primary/50 animate-pulse pointer-events-none z-20" />
                      
                      <div className={cn("relative overflow-hidden z-0", homeLayout === 'list' ? "w-28 shrink-0 border-r border-white/5" : "flex-1")}>
                        {folder.thumb ? (
                          <img 
                            src={folder.thumb} 
                            alt={name} 
                            className="absolute inset-0 w-full h-full object-cover transition-all duration-700 opacity-80 group-hover:opacity-100 group-hover:brightness-110 group-hover:scale-110" 
                            style={{
                              objectFit: 'cover',
                              objectPosition: folder.panPosition ? `${folder.panPosition.x ?? 50}% ${folder.panPosition.y ?? 50}%` : 'center',
                              transform: folder.panPosition?.zoom && folder.panPosition.zoom !== 1 ? `scale(${folder.panPosition.zoom})` : undefined
                             }}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-slate-600 transition-colors duration-500 group-hover:text-primary/60">
                            {folder.icon === 'download' 
                              ? <ArrowDown size={homeLayout === 'list' ? 24 : 48} strokeWidth={1.5} />
                              : <FolderIcon size={homeLayout === 'list' ? 24 : 48} strokeWidth={1.5} />
                            }
                          </div>
                        )}
                      </div>
                      
                      <div className={cn("bg-slate-950/80 backdrop-blur-md flex relative z-10", 
                        homeLayout === 'list' 
                          ? "flex-1 p-4 flex-col justify-center border-l-0" 
                          : "border-t border-white/5 p-3 sm:p-4 flex-col shrink-0 gap-0.5"
                      )}>
                        <p className={cn("font-black uppercase tracking-[0.1em] truncate text-primary drop-shadow-[0_0_8px_var(--color-primary-dim)]", homeLayout === 'gallery' ? "text-sm sm:text-base" : "text-xs")}>{name}</p>
                        <p className="text-[9px] text-white/50 font-bold uppercase tracking-widest">{Object.keys(folder.prompts).length} Records</p>
                      </div>

                      {showReorderArrows && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center gap-4">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const keys = Object.keys(data);
                                    const idx = keys.indexOf(name);
                                    if (idx > 0) {
                                        const newKeys = [...keys];
                                        [newKeys[idx - 1], newKeys[idx]] = [newKeys[idx], newKeys[idx - 1]];
                                        const newData: Record<string, typeof data[string]> = {};
                                        newKeys.forEach(k => { newData[k] = data[k]; });
                                        persistData(newData);
                                        sfx.tap();
                                    }
                                }}
                                className="p-3 bg-black/40 backdrop-blur-md hover:bg-black/60 border border-white/10 rounded-full text-white transition-all shadow-lg hover:scale-110 active:scale-95"
                            >
                                {homeLayout === 'list' ? <ArrowUp size={24} /> : <ArrowLeft size={24} />}
                            </button>
                            
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const keys = Object.keys(data);
                                    const idx = keys.indexOf(name);
                                    if (idx < keys.length - 1) {
                                        const newKeys = [...keys];
                                        [newKeys[idx], newKeys[idx + 1]] = [newKeys[idx + 1], newKeys[idx]];
                                        const newData: Record<string, typeof data[string]> = {};
                                        newKeys.forEach(k => { newData[k] = data[k]; });
                                        persistData(newData);
                                        sfx.tap();
                                    }
                                }}
                                className="p-3 bg-black/40 backdrop-blur-md hover:bg-black/60 border border-white/10 rounded-full text-white transition-all shadow-lg hover:scale-110 active:scale-95"
                            >
                                {homeLayout === 'list' ? <ArrowDown size={24} /> : <ArrowRight size={24} />}
                            </button>
                        </div>
                      )}
                      </motion.div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              <button 
                onClick={handleCreateFolder}
                className={cn("rounded-2xl border-2 border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-3 text-white/40 hover:text-primary",
                  homeLayout === 'grid' && "aspect-square flex-col",
                  homeLayout === 'list' && "h-24 flex-row",
                  homeLayout === 'gallery' && "aspect-square flex-col"
                )}
              >
                <Plus size={homeLayout === 'list' ? 24 : 32} />
                <span className="text-[10px] font-bold uppercase tracking-widest">New Folder</span>
              </button>
            </motion.div>
          </div>
        )}

        {view === 'folder' && currentFolder && (
          <div className="flex flex-col gap-6">
            {/* Folder Toolbar */}
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vault..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-10 py-3 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              />
            </div>

            <div className="sticky top-24 z-40 flex justify-end w-full pointer-events-none -mt-2 mb-2">
              <div className="flex items-center bg-slate-900/90 backdrop-blur-xl p-1 rounded-xl border border-white/10 shrink-0 shadow-2xl pointer-events-auto">
                <button 
                  onClick={async () => {
                    const name = await showPrompt('Create Group', 'Enter group name:');
                    if (name && currentFolderName) {
                      const newGroups = [...(data[currentFolderName].groups || []), name];
                      persistData({
                        ...data,
                        [currentFolderName]: { ...data[currentFolderName], groups: newGroups }
                      });
                      sfx.tap();
                    }
                  }} 
                  className="p-2 rounded-lg transition-colors mr-2 text-white/50 hover:text-white"
                  title="Create Group"
                >
                  <FolderPlus size={18} />
                </button>
                <div className="w-px h-6 bg-white/10 self-center mr-2" />
                <button 
                  onClick={() => setFilterMenuOpen(!filterMenuOpen)} 
                  className={cn("p-2 rounded-lg transition-colors mr-2", filterMenuOpen || activeTagFilters.length > 0 || cardSort !== 'custom' ? "bg-primary/20 text-primary border border-primary/40 shadow-[0_0_10px_rgba(0,0,0,0.5)]" : "text-white/50 hover:text-white")}
                >
                  <Filter size={18} />
                </button>
                
                <AnimatePresence>
                  {filterMenuOpen && (
                    <>
                      <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-black/20"
                        onClick={() => setFilterMenuOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-64 bg-[#111] border border-white/10 rounded-xl shadow-2xl z-50 p-4 flex flex-col gap-6"
                      >
                         <div>
                           <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2 block">Sort By</label>
                           <div className="flex flex-col gap-1">
                             {[
                               { id: 'custom', label: 'Custom Order' },
                               { id: 'alpha-asc', label: 'Alphabetical (A-Z)' },
                               { id: 'date-desc', label: 'Newest First' },
                               { id: 'date-asc', label: 'Oldest First' }
                             ].map(sortOption => (
                               <div key={sortOption.id} onClick={() => setCardSort(sortOption.id as any)} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                                 <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center shrink-0", cardSort === sortOption.id ? "border-primary" : "border-white/20")}>
                                   {cardSort === sortOption.id && <div className="w-2 h-2 bg-primary rounded-full" />}
                                 </div>
                                 <span className={cn("text-xs font-bold uppercase tracking-wider", cardSort === sortOption.id ? "text-primary" : "text-white/70")}>{sortOption.label}</span>
                               </div>
                             ))}
                           </div>
                         </div>
                         
                         <div>
                           <div className="flex items-center justify-between mb-2">
                             <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] block">Tags</label>
                             {activeTagFilters.length > 0 && (
                               <button onClick={() => setActiveTagFilters([])} className="text-[9px] text-red-400 uppercase font-bold tracking-wider hover:underline">Clear</button>
                             )}
                           </div>
                           <div className="flex flex-col gap-1 max-h-48 overflow-y-auto scrollbar-hide">
                             {['nsfw', 'sfw', 'combine', 'camera', 'pose', 'clothing', 'chair', 'solo', 'duo'].map(tag => {
                               const labels: Record<string, string> = {
                                 'nsfw': '🔞 NSFW', 'sfw': '✅ SFW', 'combine': '🔗 Combine', 'camera': '📷 Camera',
                                 'pose': '🧍 Pose', 'clothing': '👗 Clothing', 'chair': '🪑 Chair', 'solo': '👤 Solo', 'duo': '👥 Duo'
                               };
                               const active = activeTagFilters.includes(tag);
                               return (
                                 <div key={tag} onClick={() => setActiveTagFilters(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                                   <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", active ? "border-primary bg-primary text-black" : "border-white/20")}>
                                     {active && <Check size={12} />}
                                   </div>
                                   <span className={cn("text-xs font-bold uppercase tracking-wider", active ? "text-white" : "text-white/70")}>{labels[tag]}</span>
                                 </div>
                               )
                             })}
                           </div>
                         </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>

                <div className="w-px h-6 bg-white/10 self-center mr-1" />
                <button onClick={() => setShowReorderArrows(!showReorderArrows)} className={cn("p-2 rounded-lg transition-colors mr-2", showReorderArrows ? "bg-primary/20 text-primary border border-primary/40 shadow-[0_0_10px_rgba(0,0,0,0.5)]" : "text-white/50 hover:text-white")}>
                  <Move size={18} />
                </button>
                <button 
                  onClick={() => {
                    setIsMultiSelectMode(!isMultiSelectMode);
                    setSelectedPrompts(new Set());
                  }} 
                  className={cn("p-2 rounded-lg transition-colors mr-2", isMultiSelectMode ? "bg-primary text-black shadow-[0_0_10px_rgba(0,0,0,0.5)]" : "text-white/50 hover:text-white")}
                >
                  <CheckSquare size={18} />
                </button>
                <div className="w-px h-6 bg-white/10 self-center mr-1" />
                <button 
                  onClick={() => persistData({...data, [currentFolderName!]: {...currentFolder, layout: 'list'}})}
                  className={cn("p-2 rounded-lg transition-colors", currentFolder.layout === 'list' && "bg-primary text-black")}
                >
                  <List size={18} />
                </button>
                <button 
                  onClick={() => persistData({...data, [currentFolderName!]: {...currentFolder, layout: 'grid'}})}
                  className={cn("p-2 rounded-lg transition-colors", currentFolder.layout === 'grid' && "bg-primary text-black")}
                >
                  <LayoutGrid size={18} />
                </button>
              </div>
            </div>

            {/* Prompt Cards */}
            {(() => {
              const groupedPrompts = new Map<string, Array<[string, any]>>();
              const groupCovers = new Map<string, [string, any]>();
              const ungroupedPrompts: Array<[string, any]> = [];
              
              filteredPrompts.forEach((item) => {
                const p = item[1] as Prompt;
                if (p.group) {
                  if (p.isGroupCover) {
                    groupCovers.set(p.group, item);
                  } else if (p.excludeFromGroupStack) {
                    ungroupedPrompts.push(item);
                  } else {
                    if (!groupedPrompts.has(p.group)) {
                      groupedPrompts.set(p.group, []);
                    }
                    groupedPrompts.get(p.group)!.push(item);
                  }
                } else {
                  ungroupedPrompts.push(item);
                }
              });

              groupCovers.forEach((_, groupName) => {
                if (!groupedPrompts.has(groupName)) {
                  groupedPrompts.set(groupName, []);
                }
              });

              return (
                <motion.div layout
                  className={cn(
                  "grid gap-4",
                  currentFolder.layout === 'grid' ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1"
                )}>
                  <AnimatePresence>
                    {selectedGroup && (
                      <motion.div
                        key="group-header"
                        layout
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="col-span-full flex items-center gap-4 mb-2 pb-2 border-b border-white/10"
                      >
                        <button onClick={() => { setSelectedGroup(null); sfx.collapse(); }} className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-2 text-white/70 hover:text-white">
                          <ChevronLeft size={20} />
                          <span className="font-bold text-xs uppercase tracking-widest">{selectedGroup}</span>
                        </button>
                      </motion.div>
                    )}

                    {!selectedGroup && Array.from(groupedPrompts.entries()).map(([groupName, items]) => {
                      const cover = groupCovers.get(groupName);
                      
                      return (
                        <motion.div
                          key={`group-${groupName}`}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="relative p-6 rounded-2xl glass-card backdrop-blur border border-white/10 hover:border-primary/50 hover:bg-slate-800/60 transition-all group flex flex-col"
                        >
                          {isEditMode && (
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (cover) {
                                   openEditor(cover[0]);
                                 } else {
                                   // Create the cover
                                   const coverName = `Cover - ${groupName}`;
                                   const newPrompt: Prompt = {
                                      text: 'Group Description...',
                                      media: [],
                                      isFavorite: false,
                                      isDuplicate: false,
                                      tags: [],
                                      cardHidden: false,
                                      panPositions: {},
                                      createdAt: Date.now(),
                                      group: groupName,
                                      isGroupCover: true
                                   };
                                   persistData({
                                      ...data,
                                      [currentFolderName!]: {
                                         ...currentFolder,
                                         prompts: {
                                            ...currentFolder.prompts,
                                            [coverName]: newPrompt
                                         }
                                      }
                                   });
                                   openEditor(coverName);
                                 }
                               }}
                               className="absolute top-2 right-2 z-40 p-2 bg-black/50 hover:bg-primary text-white rounded-full transition-colors backdrop-blur-md"
                             >
                                <FileEdit size={14} />
                             </button>
                          )}
                          <div className="flex flex-col items-center justify-center cursor-pointer flex-1" onClick={() => { setSelectedGroup(groupName); sfx.open(); }}>
                            <div className={cn("relative w-full max-w-[120px] aspect-square mb-4", items.length > 1 ? "mt-4" : "")}>
                              {cover && cover[1].media[0] ? (
                                 <div className="absolute inset-0 rounded-xl bg-black border border-primary/50 shadow-2xl overflow-hidden z-30 group-hover:-translate-y-2 transition-transform">
                                     {cover[1].media[0].type === 'image' ? (
                                       <img src={cover[1].media[0].data} className="w-full h-full object-cover" />
                                     ) : (
                                       <video src={cover[1].media[0].data} className="w-full h-full object-cover" />
                                     )}
                                 </div>
                              ) : (
                                items.slice(0, 3).map((item, i) => (
                                 <div key={item[0]} className={cn("absolute inset-0 rounded-xl bg-black border border-white/20 shadow-2xl transition-all overflow-hidden", i === 0 ? "z-30 group-hover:-translate-y-2" : i === 1 ? "z-20 scale-95 translate-y-3 opacity-80" : "z-10 scale-90 translate-y-6 opacity-50")}>
                                   {item[1].media[0] ? (
                                     item[1].media[0].type === 'image' ? (
                                       <img src={item[1].media[0].data} className="w-full h-full object-cover" />
                                     ) : (
                                       <video src={item[1].media[0].data} className="w-full h-full object-cover" />
                                     )
                                   ) : (
                                      <div className="w-full h-full flex items-center justify-center text-white/10 bg-[#0a0a0a]">
                                        <ImageIcon size={24} />
                                      </div>
                                   )}
                                 </div>
                                ))
                              )}
                            </div>
                            <span className="font-bold text-sm uppercase tracking-widest text-primary truncate max-w-full">{cover ? cover[0] : groupName}</span>
                            {cover && cover[1].text && cover[1].text !== 'Group Description...' && (
                               <p className="text-[10px] text-white/50 text-center mt-2 line-clamp-2 max-w-[200px]">{cover[1].text}</p>
                            )}
                            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-2 bg-black/40 px-2 py-1 rounded-full">{items.length} Cards</span>
                          </div>
                        </motion.div>
                      );
                    })}

                    {(selectedGroup ? filteredPrompts.filter(([_, p]: [string, any]) => p.group === selectedGroup && !p.excludeFromGroupStack) : ungroupedPrompts).map(([name, p]: [string, any], i: number) => (
                      <motion.div
                        id={name}
                    key={name}
                    layout
                    initial={
                      cardAnimation === 'flip' ? { opacity: 0, x: -30, rotateY: 90, transformPerspective: 1000, transformOrigin: "left center" } :
                      cardAnimation === 'fade' ? { opacity: 0 } :
                      cardAnimation === 'slide-up' ? { opacity: 0, y: 40 } :
                      cardAnimation === 'scale' ? { opacity: 0, scale: 0.85 } :
                      { opacity: 1 } // none
                    }
                    animate={
                      cardAnimation === 'flip' ? { opacity: 1, x: 0, rotateY: 0, transformPerspective: 1000, transformOrigin: "left center" } :
                      cardAnimation === 'fade' ? { opacity: 1 } :
                      cardAnimation === 'slide-up' ? { opacity: 1, y: 0 } :
                      cardAnimation === 'scale' ? { opacity: 1, scale: 1 } :
                      { opacity: 1 } // none
                    }
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={
                      cardAnimation === 'none' ? { duration: 0 } : 
                      cardAnimation === 'flip' ? { type: 'spring', stiffness: 200, damping: 20, delay: i * 0.05 } : 
                      cardAnimation === 'fade' ? { duration: 0.4, delay: i * 0.03 } :
                      { type: 'spring', stiffness: 250, damping: 25, delay: i * 0.03 }
                    }
                    onClick={(e) => {
                      if (isMultiSelectMode) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (p.isExcluded) return;
                        const newSet = new Set(selectedPrompts);
                        if (newSet.has(name)) newSet.delete(name);
                        else newSet.add(name);
                        setSelectedPrompts(newSet);
                        sfx.tap();
                      } else {
                        openEditor(name);
                      }
                    }}
                    className={cn(
                      "group relative p-3 rounded-2xl glass-card backdrop-blur hover:bg-slate-800/60 transition-all cursor-pointer overflow-hidden outline outline-1 outline-transparent",
                      p.generator && "pb-5",
                      p.isFavorite && "border border-yellow-400/60 bg-gradient-to-br from-yellow-500/20 to-transparent shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] !border-yellow-400",
                      currentFolder.layout === 'list' && !isMultiSelectMode ? "flex gap-4 items-center" : "flex flex-col gap-3",
                      isMultiSelectMode && selectedPrompts.has(name) && "outline-primary bg-primary/10",
                      isMultiSelectMode && !p.isExcluded && "hover:outline-primary/50",
                      isMultiSelectMode && p.isExcluded && "opacity-50 cursor-not-allowed filter grayscale"
                    )}
                  >
                    {isMultiSelectMode && !p.isExcluded && (
                      <div className="absolute top-2 right-2 z-40 bg-black/50 rounded-full p-1 border border-white/10 pointer-events-none">
                        <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center transition-colors", selectedPrompts.has(name) ? "bg-primary border-primary text-black" : "border-white/40")}>
                           {selectedPrompts.has(name) && <Check size={10} strokeWidth={3} />}
                        </div>
                      </div>
                    )}
                    {p.isFavorite && (
                      <div className="absolute inset-0 rounded-2xl border border-yellow-400 opacity-50 animate-pulse pointer-events-none" />
                    )}
                    <div className="flex flex-col">
                      <div className={cn(
                        "relative overflow-hidden bg-black shrink-0 outline outline-1 outline-white/10",
                        currentFolder.layout === 'list' ? "w-16 h-16 rounded-xl" : "w-full aspect-square rounded-xl"
                      )}>
                        <div className="absolute top-2 left-2 flex gap-1 z-20">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const newPrompts = { ...currentFolder.prompts };
                              newPrompts[name] = { ...p, isExcluded: !p.isExcluded };
                              persistData({ ...data, [currentFolderName!]: { ...currentFolder, prompts: newPrompts } });
                              sfx.tap();
                            }}
                            className={cn("p-1.5 rounded-full backdrop-blur-md bg-black/40 border border-white/10 transition-colors pointer-events-auto", p.isExcluded ? "text-red-500 hover:text-red-400" : "text-white/40 hover:text-white")}
                          >
                            <Ban size={12} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const newPrompts = { ...currentFolder.prompts };
                              newPrompts[name] = { ...p, isFavorite: !p.isFavorite };
                              persistData({ ...data, [currentFolderName!]: { ...currentFolder, prompts: newPrompts } });
                              if (!p.isFavorite) sfx.save(); else sfx.deleted();
                            }}
                            className={cn("p-1.5 rounded-full backdrop-blur-md bg-black/40 border border-white/10 transition-colors pointer-events-auto", p.isFavorite ? "text-yellow-500 hover:text-yellow-400" : "text-white/40 hover:text-white")}
                          >
                            <Star size={12} fill={p.isFavorite ? "currentColor" : "none"} />
                          </button>
                        </div>
                        {p.media[0] ? (
                          p.media[0].type === 'image' ? (
                            <img 
                              src={p.media[0].data} 
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700 group-hover:scale-110"
                              style={{
                                objectFit: 'cover',
                                objectPosition: p.panPositions?.[0] ? `${p.panPositions[0].x ?? 50}% ${p.panPositions[0].y ?? 50}%` : 'center 20%',
                                transform: p.panPositions?.[0]?.zoom && p.panPositions[0].zoom !== 1 ? `scale(${p.panPositions[0].zoom})` : undefined
                              }}
                            />
                          ) : (
                            <video src={p.media[0].data} className="w-full h-full object-cover object-[center_20%]" />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/10">
                            <ImageIcon size={32} />
                          </div>
                        )}
                        
                        {isEditMode && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm z-40">
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                setClipboard({ action: 'copy', sourceFolder: currentFolderName!, promptName: name, prompt: p });
                                sfx.tap();
                              }}
                              className="p-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white rounded-full transition-colors"
                            >
                              <Copy size={14} />
                            </button>
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                setClipboard({ action: 'cut', sourceFolder: currentFolderName!, promptName: name, prompt: p });
                                sfx.tap();
                              }}
                              className="p-2 bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white rounded-full transition-colors"
                            >
                              <Scissors size={14} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                const newPrompts = { ...currentFolder.prompts };
                                newPrompts[name] = { ...p, cardHidden: !p.cardHidden };
                                persistData({ ...data, [currentFolderName!]: { ...currentFolder, prompts: newPrompts } });
                                sfx.tap();
                              }}
                              className="p-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500 hover:text-white rounded-full transition-colors"
                            >
                              {p.cardHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                const el = e.currentTarget.closest('.prompt-item') as HTMLElement;
                                if (await showConfirm('Delete Prompt', `Move prompt "${name}" to Recycle Bin?`)) {
                                  const newPrompts = { ...currentFolder.prompts };
                                  const promptData = newPrompts[name];
                                  delete newPrompts[name];
                                  persistData({ ...data, [currentFolderName!]: { ...currentFolder, prompts: newPrompts } });
                                  
                                  const newTrashItem: TrashItem = {
                                    id: Date.now().toString() + Math.random(),
                                    type: 'prompt',
                                    name,
                                    folderName: currentFolderName!,
                                    data: promptData,
                                    deletedAt: Date.now()
                                  };
                                  persistTrash([...trashData, newTrashItem]);
                                  sfx.deleted(el);
                                }
                              }}
                              className="p-2 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}

                        {showReorderArrows && (
                          <div className="absolute inset-0 z-30 flex items-center justify-center gap-2">
                              <button
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      const keys = Object.keys(currentFolder.prompts);
                                    const idx = Object.keys(currentFolder.prompts).indexOf(name);
                                    if (idx > 0) {
                                        const newKeys = [...keys];
                                        [newKeys[idx - 1], newKeys[idx]] = [newKeys[idx], newKeys[idx - 1]];
                                        const finalPrompts: Record<string, Prompt> = {};
                                        newKeys.forEach(k => { finalPrompts[k] = currentFolder.prompts[k]; });
                                        persistData({...data, [currentFolderName!]: {...currentFolder, prompts: finalPrompts}});
                                        sfx.tap();
                                    }
                                }}
                                className="p-2 bg-black/40 backdrop-blur-md hover:bg-black/60 border border-white/10 rounded-full text-white transition-all shadow-lg"
                            >
                                {currentFolder.layout === 'list' ? <ArrowUp size={16} /> : <ArrowLeft size={16} />}
                            </button>
                            
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const keys = Object.keys(currentFolder.prompts);
                                    const idx = Object.keys(currentFolder.prompts).indexOf(name);
                                    if (idx < keys.length - 1) {
                                        const newKeys = [...keys];
                                        [newKeys[idx], newKeys[idx + 1]] = [newKeys[idx + 1], newKeys[idx]];
                                        const finalPrompts: Record<string, Prompt> = {};
                                        newKeys.forEach(k => { finalPrompts[k] = currentFolder.prompts[k]; });
                                        persistData({...data, [currentFolderName!]: {...currentFolder, prompts: finalPrompts}});
                                        sfx.tap();
                                    }
                                }}
                                className="p-2 bg-black/40 backdrop-blur-md hover:bg-black/60 border border-white/10 rounded-full text-white transition-all shadow-lg"
                            >
                                {currentFolder.layout === 'list' ? <ArrowDown size={16} /> : <ArrowRight size={16} />}
                            </button>
                        </div>
                      )}
                    </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "font-bold text-xs uppercase tracking-wider break-words leading-tight flex-1",
                          p.isFavorite ? "text-yellow-400" : "text-slate-100"
                        )}>{name}</p>
                        <div className="flex items-center gap-1 shrink-0 mt-0.5 relative z-20">
                          {p.media.length > 0 && <span className="text-[9px] px-1.5 py-0.5 bg-black/40 rounded text-white/60">+{p.media.length}</span>}
                        </div>
                      </div>
                      <p className="text-[10px] text-white/40 mt-1 line-clamp-2 leading-relaxed">
                        {p.text || "No prompt text content"}
                      </p>
                      {p.tags && p.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.tags.map(tag => {
                            const colors: Record<string, string> = {
                              'nsfw': 'text-red-400 border-red-400/30 bg-red-400/10',
                              'sfw': 'text-blue-400 border-blue-400/30 bg-blue-400/10',
                              'combine': 'text-amber-400 border-amber-400/30 bg-amber-400/10',
                              'camera': 'text-purple-400 border-purple-400/30 bg-purple-400/10',
                              'pose': 'text-pink-400 border-pink-400/30 bg-pink-400/10',
                              'clothing': 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
                              'chair': 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
                              'solo': 'text-sky-400 border-sky-400/30 bg-sky-400/10',
                              'duo': 'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-400/10',
                            };
                            const labels: Record<string, string> = {
                              'nsfw': '🔞 NSFW',
                              'sfw': '✅ SFW',
                              'combine': '🔗 Combine',
                              'camera': '📷 Camera',
                              'pose': '🧍 Pose',
                              'clothing': '👗 Clothing',
                              'chair': '🪑 Chair',
                              'solo': '👤 Solo',
                              'duo': '👥 Duo',
                            };
                            return (
                              <span key={tag} className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border", colors[tag] || "text-white/40 border-white/10 bg-white/5")}>
                                {labels[tag] || tag}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {p.generator && (
                      <div className={cn(
                        "absolute bottom-0 left-0 w-full text-center text-[7px] font-bold uppercase tracking-[0.2em] py-0.5 z-10",
                        GENERATOR_COLORS[p.generator] || GENERATOR_COLORS['Omni AI']
                      )}>
                        {p.generator}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
            )
            })()}
            {filteredPrompts.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-white/20">
                <FileEdit size={48} className="mb-4 opacity-10" />
                <p className="text-sm font-medium uppercase tracking-[0.2em]">Vault Empty</p>
              </div>
            )}
            
            <AnimatePresence>
              {isMultiSelectMode && (
                 <motion.div 
                   initial={{ y: 100, opacity: 0 }}
                   animate={{ y: 0, opacity: 1 }}
                   exit={{ y: 100, opacity: 0 }}
                   className="fixed bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 bg-[#111] border border-white/10 p-2 sm:p-3 rounded-2xl sm:rounded-full shadow-2xl z-[60] flex flex-wrap sm:flex-nowrap items-center justify-center gap-2 w-[calc(100%-2rem)] sm:w-auto"
                 >
                   <span className="text-xs font-bold px-3 text-white/80 shrink-0 basis-full sm:basis-auto text-center sm:text-left pb-1 sm:pb-0">{selectedPrompts.size} Selected</span>
                   <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
                     <button 
                       onClick={() => {
                         const newSet = new Set<string>();
                         Object.entries(currentFolder.prompts).forEach(([n, p]: [string, any]) => {
                           if (!p.isExcluded) newSet.add(n);
                         });
                         setSelectedPrompts(newSet);
                         sfx.tap();
                       }}
                       className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-primary/20 text-primary rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-primary/30 transition-colors shadow-lg"
                     >
                       All
                     </button>
                     <button 
                       onClick={() => { setIsMultiSelectMode(false); setSelectedPrompts(new Set()); }}
                       className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-white/5 text-white/50 rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-colors"
                     >
                       Cancel
                     </button>
                     <button 
                       disabled={selectedPrompts.size === 0}
                       onClick={() => { setShowMassContentDialog(true); sfx.tap(); }}
                       className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-white/10 text-white rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-white/20 transition-colors shadow-lg disabled:opacity-50 whitespace-nowrap"
                     >
                       Content
                     </button>
                     <button 
                       disabled={selectedPrompts.size === 0}
                       onClick={() => { setShowMassEditDialog(true); sfx.tap(); }}
                       className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-primary text-black rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-lg disabled:opacity-50 disabled:bg-primary/50 whitespace-nowrap"
                     >
                       Tags/Gen
                     </button>
                     <select
                       disabled={selectedPrompts.size === 0}
                       onChange={(e) => {
                          handleMassGroupSelect(e.target.value);
                          // reset native select after choosing
                          e.target.value = '';
                       }}
                       value=""
                       className="flex-1 sm:flex-none basis-full sm:basis-auto px-4 py-2.5 sm:py-2 bg-white/10 text-white rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-white/20 transition-colors shadow-lg disabled:opacity-50 outline-none appearance-none cursor-pointer text-center"
                     >
                       <option value="" disabled hidden>Add to Group</option>
                       <option value="none">Remove from Group</option>
                       {(currentFolderName && data[currentFolderName]?.groups || []).map(g => (
                          <option key={g} value={g}>{g}</option>
                       ))}
                     </select>
                   </div>
                 </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* --- Footer Nav --- */}
      <footer className="fixed bottom-0 left-0 right-0 h-20 bg-slate-950/80 backdrop-blur-xl border-t border-white/5 px-6 pb-safe flex items-center justify-between z-40">
        <div className="flex gap-2">
          <button 
            onClick={() => setPasteTesterOpen(true)}
            className="p-3 text-white/30 hover:text-primary transition-all flex flex-col items-center gap-1"
          >
            <FileEdit size={20} />
            <span className="text-[8px] font-bold uppercase tracking-widest hidden sm:inline">Trimmer</span>
          </button>
          {clipboard && view === 'folder' && currentFolderName && (
            <button 
              onClick={async () => {
                let name = clipboard.promptName;
                if (data[currentFolderName]?.prompts[name]) {
                  name = await showPrompt('Paste', 'Name already exists. Choose a new name:', name + ' (Copy)') || '';
                }
                if (name && !data[currentFolderName]?.prompts[name]) {
                  const newData = { ...data };
                  newData[currentFolderName].prompts[name] = clipboard.prompt;
                  if (clipboard.action === 'cut') {
                    delete newData[clipboard.sourceFolder].prompts[clipboard.promptName];
                    setClipboard(null);
                  }
                  persistData(newData);
                  sfx.save();
                }
              }}
              className="p-3 text-primary animate-pulse hover:scale-110 transition-all flex flex-col items-center gap-1"
            >
              <Copy size={20} />
              <span className="text-[8px] font-bold uppercase tracking-widest hidden sm:inline">Paste</span>
            </button>
          )}
        </div>
        <button 
          onClick={() => view === 'home' ? setRevealHidden(!revealHidden) : setRevealHiddenCards(!revealHiddenCards)}
          className={cn("p-3 rounded-xl transition-all", (view === 'home' ? revealHidden : revealHiddenCards) ? "text-primary bg-primary/10" : "text-white/30 hover:text-white")}
        >
          {(view === 'home' ? revealHidden : revealHiddenCards) ? <Eye size={24} /> : <EyeOff size={24} />}
        </button>
        <button 
          onClick={() => openEditor()}
          className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-[0_0_20px_var(--color-primary-dim)] hover:scale-110 active:scale-95 transition-all -translate-y-4 border-4 border-slate-950"
        >
          <Plus size={32} strokeWidth={2.5} />
        </button>
        <button 
          onClick={goHome}
          className={cn("p-3 rounded-xl transition-all", view === 'home' ? "text-primary bg-primary/10" : "text-white/30 hover:text-white")}
        >
          <Smartphone size={24} />
        </button>
        <button 
          onClick={() => setCardFilter(cardFilter === 'all' ? 'favorites' : 'all')}
          className={cn("p-3 transition-all", cardFilter === 'favorites' ? "text-yellow-500" : "text-white/30")}
        >
          <Star size={24} fill={cardFilter === 'favorites' ? "currentColor" : "none"} />
        </button>
      </footer>

      {/* --- Prompt Editor Modal --- */}
      <AnimatePresence>
        {editorOpen && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-slate-950 flex flex-col pb-safe"
          >
            <header className="h-16 flex items-center justify-between px-4 border-b border-white/5 flex-shrink-0">
              <button 
                onClick={() => setEditorOpen(false)}
                className="p-3 text-white/40 hover:text-white"
              >
                <X size={24} />
              </button>
              <h2 className="text-xs font-bold uppercase tracking-widest">
                {activePromptName ? 'Edit Prompt' : 'New Vault Card'}
              </h2>
              <button 
                onClick={handleSavePrompt} 
                disabled={!editTitle.trim()}
                className="p-3 text-primary disabled:opacity-30 flex items-center gap-2"
              >
                <Check size={24} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between ">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">Media Stack ({editMedia.length}/{MAX_MEDIA})</label>
                  <button 
                    onClick={() => document.getElementById('media-upload')?.click()}
                    className="p-2 bg-primary/10 text-primary border border-primary/20 rounded-lg"
                  >
                    <Plus size={16} />
                  </button>
                  <input type="file" id="media-upload" hidden multiple accept="image/*,video/*" onChange={handleFileUpload} />
                </div>
                
                {editMedia.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {/* Main Image */}
                    <div className="relative group mb-2 flex flex-col items-center w-full">
                      <div className="w-full aspect-square sm:aspect-video rounded-t-xl overflow-hidden border border-white/10 bg-black relative z-10 flex items-center justify-center">
                         {editMedia[activeMediaIndex] && (editMedia[activeMediaIndex].type === 'image' ? (
                           isPanMode ? (
                              <div className="relative w-full h-full bg-[#111] bg-opacity-80 flex items-center justify-center p-4">
                                 <div 
                                    className="relative outline outline-2 outline-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.8)] overflow-hidden cursor-move transition-all touch-none"
                                    style={{ width: panBoxSize, height: panBoxSize }}
                                    onPointerDown={startPanDrag}
                                    onPointerMove={handlePanDrag}
                                    onPointerUp={endPanDrag}
                                    onPointerCancel={endPanDrag}
                                 >
                                    <img 
                                      src={editMedia[activeMediaIndex].data} 
                                      className="w-full h-full pointer-events-none" 
                                      style={{ 
                                        objectFit: 'cover',
                                        objectPosition: `${editPanPositions[activeMediaIndex]?.x ?? 50}% ${editPanPositions[activeMediaIndex]?.y ?? 50}%`,
                                        transform: editPanPositions[activeMediaIndex]?.zoom && editPanPositions[activeMediaIndex].zoom !== 1 ? `scale(${editPanPositions[activeMediaIndex].zoom})` : undefined
                                      }}
                                    />
                                 </div>
                              </div>
                           ) : (
                              <img src={editMedia[activeMediaIndex].data} className="w-full h-full object-contain bg-black/50 backdrop-blur-3xl" />
                           )
                         ) : (
                           <video src={editMedia[activeMediaIndex].data} className="w-full h-full object-contain bg-black/50 backdrop-blur-3xl" controls />
                         ))}
                         <div className="absolute top-3 right-3 flex gap-2 transition-opacity">
                           {editMedia[activeMediaIndex] && editMedia[activeMediaIndex].type === 'image' && (
                             <button
                               onClick={() => setIsPanMode(!isPanMode)}
                               className={cn("p-2 rounded-full transition-colors backdrop-blur-md shadow-lg", isPanMode ? "bg-primary text-black" : "bg-black/60 text-white hover:bg-primary/20")}
                             >
                               <Camera size={14} />
                             </button>
                           )}
                           <button 
                             onClick={() => {
                               setEditorMedia(prev => prev.filter((_, idx) => idx !== activeMediaIndex));
                               setActiveMediaIndex(0);
                               setIsPanMode(false);
                             }}
                             className="p-2 bg-black/60 text-white rounded-full hover:bg-red-500 transition-colors backdrop-blur-md shadow-lg opacity-0 group-hover:opacity-100"
                           >
                             <Trash2 size={14} />
                           </button>
                         </div>
                      </div>
                      
                      {isPanMode && editMedia[activeMediaIndex] && editMedia[activeMediaIndex].type === 'image' && (
                        <div className="w-full p-4 bg-[#111] border border-white/5 border-t-0 flex flex-col gap-4">
                           <div className="flex flex-col gap-2">
                             <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold flex justify-between">
                               <span>Image Zoom</span>
                               <span>{((editPanPositions[activeMediaIndex] || { zoom: 1 }).zoom).toFixed(1)}x</span>
                             </label>
                             <input type="range" min="0.5" max="3" step="0.1" value={(editPanPositions[activeMediaIndex] || { zoom: 1 }).zoom} onChange={(e) => setEditPanPositions(prev => ({ ...prev, [activeMediaIndex]: { ...(prev[activeMediaIndex] || { x: 50, y: 50 }), zoom: Number(e.target.value) } }))} className="accent-primary h-1" />
                           </div>
                           <div className="flex flex-col gap-2">
                             <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold flex justify-between">
                               <span>Thumbnail Box Size</span>
                               <span>{panBoxSize}px</span>
                             </label>
                             <input type="range" min="100" max="400" step="10" value={panBoxSize} onChange={(e) => setPanBoxSize(Number(e.target.value))} className="accent-primary h-1" />
                           </div>
                        </div>
                      )}
                      
                      <button
                        onClick={() => {
                          if (activeMediaIndex !== 0) {
                            const newMedia = [...editMedia];
                            const temp = newMedia[0];
                            newMedia[0] = newMedia[activeMediaIndex];
                            newMedia[activeMediaIndex] = temp;
                            setEditorMedia(newMedia);
                            setActiveMediaIndex(0);
                          }
                        }}
                        className={cn(
                          "w-full flex justify-center items-center gap-2 px-4 py-3 rounded-b-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-t-0 z-0",
                          activeMediaIndex === 0 
                            ? "bg-slate-900 border-primary text-primary" 
                            : "bg-[#0a0a0a] hover:bg-white/5 border-white/10 text-white/50 hover:text-white"
                        )}
                      >
                        {activeMediaIndex === 0 ? <Lock size={12} /> : <Unlock size={12} />}
                        {activeMediaIndex === 0 ? "Main Thumbnail" : "Set as Thumbnail"}
                      </button>
                    </div>

                    {/* Thumbnails Row */}
                    {editMedia.length > 1 && (
                      <div className="flex gap-4 overflow-x-auto pb-4 pt-2 scrollbar-hide">
                        {editMedia.map((m, i) => i !== activeMediaIndex && (
                          <div 
                            key={i} 
                            onClick={() => setActiveMediaIndex(i)}
                            className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 cursor-pointer transition-all border border-white/10 hover:scale-105 bg-black"
                          >
                            {m.type === 'image' ? <img src={m.data} className="w-full h-full object-cover object-[center_20%]" /> : <video src={m.data} className="w-full h-full object-cover object-[center_20%]" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-28 border border-dashed border-white/5 rounded-xl flex items-center justify-center text-white/10">
                    <ImageIcon size={24} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">Title</label>
                <input 
                  type="text" 
                  value={editTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  placeholder="Vault Identity"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-base focus:border-primary/50 outline-none transition-all placeholder:text-white/10"
                />
              </div>

              <div className="flex flex-col gap-2 relative">
                <div className="flex items-center justify-between">
                   <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">Saved Prompt</label>
                   <button 
                     onClick={() => setIsPromptExpanded(true)}
                     className="px-2 py-1 text-[10px] uppercase font-bold tracking-widest text-white/50 hover:text-white flex items-center gap-1 transition-colors"
                   >
                     <Maximize2 size={12} /> Expand
                   </button>
                </div>
                <textarea 
                  value={editText}
                  onChange={(e) => setEditorText(e.target.value)}
                  placeholder="Paste AI instructions here..."
                  className="w-full h-48 bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm focus:border-primary/50 outline-none transition-all resize-none placeholder:text-white/10"
                />
              </div>

              <div className="flex flex-col gap-3">
                 <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">Metadata Tags</label>
                 <div className="flex flex-wrap gap-2">
                    {['nsfw', 'sfw', 'combine', 'camera', 'pose', 'clothing', 'chair', 'solo', 'duo'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => setEditorTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                        className={cn(
                          "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all",
                          editTags.includes(tag) ? "bg-primary border-primary text-black" : "border-white/10 text-white/40 hover:border-white/30"
                        )}
                      >
                        {tag === 'nsfw' ? '🔞 NSFW' : tag === 'sfw' ? '✅ SFW' : tag === 'combine' ? '🔗 Combine' : tag === 'camera' ? '📷 Camera' : tag === 'pose' ? '🧍 Pose' : tag === 'clothing' ? '👗 Clothing' : tag === 'chair' ? '🪑 Chair' : tag === 'solo' ? '👤 Solo' : '👥 Duo'}
                      </button>
                    ))}
                 </div>
              </div>

              <div className="flex flex-col gap-2 relative z-50">
                 <div className="flex items-center gap-2">
                     <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">AI Generator</label>
                 </div>
                 <select
                    value={editGenerator || ''}
                    onChange={(e) => setEditGenerator(e.target.value || undefined)}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all appearance-none"
                 >
                    <option value="">None</option>
                    {GENERATORS.map(g => (
                       <option key={g} value={g}>{g}</option>
                    ))}
                 </select>
              </div>

              <div className="flex flex-col gap-2 relative z-40">
                 <div className="flex items-center gap-2">
                     <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">Group</label>
                 </div>
                 <select
                    value={editGroup || ''}
                    onChange={(e) => {
                      setEditorGroup(e.target.value || undefined);
                      if (!e.target.value) {
                         setEditExcludeFromGroupStack(false);
                         setEditIsGroupCover(false);
                      }
                    }}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all appearance-none"
                 >
                    <option value="">None</option>
                    {(currentFolderName && data[currentFolderName]?.groups || []).map(g => (
                       <option key={g} value={g}>{g}</option>
                    ))}
                 </select>
                 {editGroup && (
                    <div className="flex flex-col gap-2 mt-2">
                       <label className="flex items-center gap-3 cursor-pointer" onClick={(e) => {
                          e.preventDefault();
                          setEditExcludeFromGroupStack(!editExcludeFromGroupStack);
                          if (!editExcludeFromGroupStack) setEditIsGroupCover(false);
                       }}>
                          <div className={cn("w-5 h-5 rounded border flex items-center justify-center transition-colors", editExcludeFromGroupStack ? "bg-primary border-primary text-black" : "border-white/30")}>
                             {editExcludeFromGroupStack && <Check size={14} strokeWidth={3} />}
                          </div>
                          <span className="text-xs font-bold text-white/70 uppercase tracking-widest">Exclude from Stack</span>
                       </label>
                       <label className="flex items-center gap-3 cursor-pointer" onClick={(e) => {
                          e.preventDefault();
                          setEditIsGroupCover(!editIsGroupCover);
                          if (!editIsGroupCover) setEditExcludeFromGroupStack(false);
                       }}>
                          <div className={cn("w-5 h-5 rounded border flex items-center justify-center transition-colors", editIsGroupCover ? "bg-primary border-primary text-black" : "border-white/30")}>
                             {editIsGroupCover && <Check size={14} strokeWidth={3} />}
                          </div>
                          <span className="text-xs font-bold text-white/70 uppercase tracking-widest">Set as Stack Cover</span>
                       </label>
                    </div>
                 )}
              </div>
            </div>

            <footer className="px-6 py-6 border-t border-white/5 flex gap-4">
              <button 
                onClick={() => { navigator.clipboard.writeText(editText); sfx.tap(); }}
                className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all"
              >
                <Copy size={16} /> Copy
              </button>
              <button 
                onClick={handleSavePrompt}
                className="flex-[2] py-4 bg-primary text-white rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/30"
              >
                <Save size={16} /> {activePromptName ? 'Update Prompt Card' : 'Secure Save'}
              </button>
            </footer>
          </motion.div>
        )}
        
        {isPromptExpanded && (
          <motion.div
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.95 }}
             className="fixed inset-0 z-[100] bg-slate-950 flex flex-col pb-safe"
          >
             <header className="h-16 flex items-center justify-between px-4 border-b border-white/5 flex-shrink-0">
               <div className="w-10"></div>
               <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Expanded Prompt</h2>
               <button onClick={() => setIsPromptExpanded(false)} className="p-3 text-white/40 hover:text-white">
                 <X size={24} />
               </button>
             </header>
             <div className="flex-1 p-4 sm:p-6 flex flex-col gap-4 overflow-hidden">
               <textarea 
                 value={editText}
                 onChange={(e) => setEditorText(e.target.value)}
                 placeholder="Paste AI instructions here..."
                 className="flex-1 w-full bg-[#111] border border-white/10 rounded-2xl px-6 py-6 font-sans text-base focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all resize-none placeholder:text-white/10 leading-relaxed shadow-inner"
               />
               <button 
                 onClick={() => setIsPromptExpanded(false)}
                 className="w-full py-4 bg-primary text-black rounded-2xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/30"
               >
                 Done Editing
               </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Left Sidebar (Recycle Bin) --- */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSidebarOpen(false);
                setIsTrashMultiSelectMode(false);
                setSelectedTrashItems(new Set());
              }}
              className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed top-0 left-0 bottom-0 w-[80vw] max-w-sm z-[70] bg-slate-900 border-r border-white/5 p-6 flex flex-col gap-6 shadow-2xl"
            >
              <div className="flex items-center justify-between shrink-0">
                <h3 className="font-bold uppercase tracking-[0.2em] text-xs text-red-400 flex items-center gap-2">
                  <Trash2 size={16} />
                  Recycle Bin
                </h3>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setIsTrashMultiSelectMode(!isTrashMultiSelectMode);
                      setSelectedTrashItems(new Set());
                    }} 
                    className={cn("text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors", isTrashMultiSelectMode && "bg-primary/20 text-primary hover:bg-primary/30")}
                  >
                    <CheckSquare size={16} />
                  </button>
                  <button onClick={() => {
                    setSidebarOpen(false);
                    setIsTrashMultiSelectMode(false);
                    setSelectedTrashItems(new Set());
                  }} className="text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {trashData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-white/20 gap-3">
                    <Trash2 size={32} />
                    <span className="text-xs uppercase tracking-widest font-bold">Trash is Empty</span>
                  </div>
                ) : (
                  trashData.sort((a, b) => b.deletedAt - a.deletedAt).map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => {
                        if (isTrashMultiSelectMode) {
                          const newSet = new Set(selectedTrashItems);
                          if (newSet.has(item.id)) newSet.delete(item.id);
                          else newSet.add(item.id);
                          setSelectedTrashItems(newSet);
                          sfx.tap();
                        }
                      }}
                      className={cn("p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col gap-3 transition-colors", isTrashMultiSelectMode && "cursor-pointer hover:bg-white/10", isTrashMultiSelectMode && selectedTrashItems.has(item.id) && "border-primary bg-primary/10")}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {isTrashMultiSelectMode && (
                             <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0", selectedTrashItems.has(item.id) ? "bg-primary border-primary text-black" : "border-white/40")}>
                                {selectedTrashItems.has(item.id) && <Check size={10} strokeWidth={3} />}
                             </div>
                          )}
                          <div className="flex flex-col">
                            <span className="text-xs font-bold uppercase tracking-wider text-white/80 line-clamp-1">{item.name}</span>
                            <span className="text-[10px] text-white/40">{item.type} {item.folderName ? `from ${item.folderName}` : ''}</span>
                          </div>
                        </div>
                        <span className="text-[8px] text-white/30 uppercase tracking-widest shrink-0">{new Date(item.deletedAt).toLocaleDateString()}</span>
                      </div>
                      
                      {!isTrashMultiSelectMode && (
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              // Restore
                              if (item.type === 'folder') {
                                  const folderData = item.data as Folder;
                                  const newName = !data[item.name] ? item.name : `${item.name} (Restored)`;
                                  persistData({...data, [newName]: folderData});
                              } else if (item.type === 'prompt') {
                                  // Restore to original folder, or root if folder doesn't exist
                                  const folderName = item.folderName && data[item.folderName] ? item.folderName : Object.keys(data)[0];
                                  if (folderName) {
                                      const promptData = item.data as Prompt;
                                      const newName = !data[folderName].prompts[item.name] ? item.name : `${item.name} (Restored)`;
                                      const newData = {...data};
                                      newData[folderName].prompts[newName] = promptData;
                                      persistData(newData);
                                  }
                              }
                              persistTrash(trashData.filter(t => t.id !== item.id));
                              sfx.save();
                            }}
                            className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                          >
                            <RotateCcw size={12} />
                            Restore
                          </button>

                          <button 
                            onClick={async (e) => {
                              e.stopPropagation();
                              if(await showConfirm('Permanent Delete', `Permanently delete "${item.name}"?`)) {
                                  persistTrash(trashData.filter(t => t.id !== item.id));
                                  sfx.deleted();
                              }
                            }}
                            className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                          >
                            <Trash2 size={12} />
                            Burn
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {trashData.length > 0 && !isTrashMultiSelectMode && (
                <div className="flex flex-col gap-3 shrink-0">
                  <button 
                    onClick={async () => {
                      if(await showConfirm('Recover All', `Restore all items from Recycle Bin?`)) {
                        const newData = {...data};
                        let modified = false;
                        trashData.forEach(item => {
                          if (item.type === 'folder') {
                            const folderData = item.data as Folder;
                            const newName = !newData[item.name] ? item.name : `${item.name} (Restored)`;
                            newData[newName] = folderData;
                            modified = true;
                          } else if (item.type === 'prompt') {
                            const folderName = item.folderName && newData[item.folderName] ? item.folderName : Object.keys(newData)[0];
                            if (folderName) {
                              const promptData = item.data as Prompt;
                              const newName = !newData[folderName].prompts[item.name] ? item.name : `${item.name} (Restored)`;
                              newData[folderName].prompts[newName] = promptData;
                              modified = true;
                            }
                          }
                        });
                        if (modified) persistData(newData);
                        persistTrash([]);
                        sfx.save();
                        setSidebarOpen(false);
                      }
                    }}
                    className="w-full py-4 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/20 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    <RotateCcw size={16} />
                    Recover All
                  </button>
                  <button 
                    onClick={async () => {
                      if(await showConfirm('Empty Trash', `Permanently delete all items in Recycle Bin?`)) {
                          persistTrash([]);
                          sfx.deleted();
                          setSidebarOpen(false);
                      }
                    }}
                    className="w-full py-4 bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/20 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    <Trash2 size={16} />
                    Empty Trash
                  </button>
                </div>
              )}

              {isTrashMultiSelectMode && trashData.length > 0 && (
                <div className="flex flex-col gap-3 shrink-0">
                  <div className="flex gap-2">
                     <button
                       onClick={() => {
                         const allIds = new Set(trashData.map(t => t.id));
                         setSelectedTrashItems(allIds);
                         sfx.tap();
                       }}
                       className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors"
                     >
                       Select All
                     </button>
                     <button
                       onClick={() => {
                         setIsTrashMultiSelectMode(false);
                         setSelectedTrashItems(new Set());
                       }}
                       className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/50 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors"
                     >
                       Cancel
                     </button>
                  </div>
                  <div className="flex gap-2">
                     <button
                       disabled={selectedTrashItems.size === 0}
                       onClick={async () => {
                          if (selectedTrashItems.size > 0 && await showConfirm('Restore Selected', `Restore ${selectedTrashItems.size} items?`)) {
                            const newData = {...data};
                            let modified = false;
                            const itemsToRestore = trashData.filter(t => selectedTrashItems.has(t.id));
                            itemsToRestore.forEach(item => {
                              if (item.type === 'folder') {
                                const folderData = item.data as Folder;
                                const newName = !newData[item.name] ? item.name : `${item.name} (Restored)`;
                                newData[newName] = folderData;
                                modified = true;
                              } else if (item.type === 'prompt') {
                                const folderName = item.folderName && newData[item.folderName] ? item.folderName : Object.keys(newData)[0];
                                if (folderName) {
                                  const promptData = item.data as Prompt;
                                  const newName = !newData[folderName].prompts[item.name] ? item.name : `${item.name} (Restored)`;
                                  newData[folderName].prompts[newName] = promptData;
                                  modified = true;
                                }
                              }
                            });
                            if (modified) persistData(newData);
                            persistTrash(trashData.filter(t => !selectedTrashItems.has(t.id)));
                            setIsTrashMultiSelectMode(false);
                            setSelectedTrashItems(new Set());
                            sfx.save();
                          }
                       }}
                       className="flex-1 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 disabled:opacity-50 border border-blue-500/20 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                     >
                       <RotateCcw size={14} /> Restore
                     </button>
                     <button
                       disabled={selectedTrashItems.size === 0}
                       onClick={async () => {
                          if (selectedTrashItems.size > 0 && await showConfirm('Delete Selected', `Permanently delete ${selectedTrashItems.size} items?`)) {
                            persistTrash(trashData.filter(t => !selectedTrashItems.has(t.id)));
                            setIsTrashMultiSelectMode(false);
                            setSelectedTrashItems(new Set());
                            sfx.deleted();
                          }
                       }}
                       className="flex-1 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-500 disabled:opacity-50 border border-red-500/20 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                     >
                       <Trash2 size={14} /> Delete
                     </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- Mass Edit Modal --- */}
      <AnimatePresence>
        {showMassEditDialog && currentFolder && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col"
          >
            <header className="flex justify-between items-center p-6 border-b border-white/5 bg-black/20 shrink-0">
              <button 
                onClick={() => {
                  setShowMassEditDialog(false);
                  setMassEditTags([]);
                  setMassEditGenerator(undefined);
                  setMassEditGroup(undefined);
                }} 
                className="px-6 py-3 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white rounded-full transition-colors text-xs font-bold uppercase tracking-widest"
              >
                Cancel
              </button>
              <h2 className="text-xs font-bold uppercase tracking-widest text-primary">
                Mass Edit ({selectedPrompts.size})
              </h2>
              <button 
                onClick={applyMassEdit}
                className="px-6 py-3 bg-primary text-black text-xs font-bold uppercase tracking-widest rounded-full hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8 max-w-5xl mx-auto w-full">
               <div className="flex-1 flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                   <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">Set AI Generator</label>
                   <select
                      value={massEditGenerator || ''}
                      onChange={(e) => setMassEditGenerator(e.target.value || undefined)}
                      className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all appearance-none"
                   >
                      <option value="">(No Change)</option>
                      <option value="none">None (Remove Generator)</option>
                      {GENERATORS.map(g => (
                         <option key={g} value={g}>{g}</option>
                      ))}
                   </select>
                </div>
  
                <div className="flex flex-col gap-2">
                   <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">Set Group</label>
                   <select
                      value={massEditGroup || ''}
                      onChange={(e) => setMassEditGroup(e.target.value || undefined)}
                      className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all appearance-none"
                   >
                      <option value="">(No Change)</option>
                      <option value="none">None (Remove Group)</option>
                      {(currentFolderName && data[currentFolderName]?.groups || []).map(g => (
                         <option key={g} value={g}>{g}</option>
                      ))}
                   </select>
                </div>

                <div className="flex flex-col gap-2">
                   <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">Add Tags</label>
                   <div className="flex flex-wrap gap-2">
                      {['nsfw', 'sfw', 'combine', 'camera', 'pose', 'clothing', 'chair', 'solo', 'duo'].map(tag => {
                        const labels: Record<string, string> = {
                          'nsfw': '🔞 NSFW', 'sfw': '✅ SFW', 'combine': '🔗 Combine', 'camera': '📷 Camera',
                          'pose': '🧍 Pose', 'clothing': '👗 Clothing', 'chair': '🪑 Chair', 'solo': '👤 Solo', 'duo': '👥 Duo'
                        };
                        const active = massEditTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => {
                                sfx.tap();
                                setMassEditTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag]);
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border",
                              active ? "bg-primary text-black border-primary" : "bg-[#111] text-white/40 border-white/10 hover:border-white/30"
                            )}
                          >
                            {labels[tag]}
                          </button>
                        )
                      })}
                   </div>
                </div>
               </div>
               
               <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-4 h-fit max-h-full overflow-y-auto p-4 bg-white/5 rounded-2xl border border-white/5">
                 {Array.from<string>(selectedPrompts).map(name => {
                   const p = currentFolder.prompts[name];
                   if (!p) return null;
                   return (
                     <div key={name} className="relative aspect-square rounded-xl overflow-hidden bg-black border border-white/10 group flex flex-col">
                       {p.media[0] ? (
                          p.media[0].type === 'image' ? (
                            <img src={p.media[0].data} className="w-full h-full object-cover object-[center_20%] opacity-80 group-hover:opacity-100 transition-opacity" />
                          ) : (
                            <video src={p.media[0].data} className="w-full h-full object-cover object-[center_20%] opacity-80 group-hover:opacity-100 transition-opacity" />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/10">
                            <ImageIcon size={24} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           <span className="text-[9px] font-bold text-white px-2 py-1 bg-black/80 rounded max-w-full truncate break-all block text-center line-clamp-2">{name}</span>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newSet = new Set(selectedPrompts);
                            newSet.delete(name);
                            setSelectedPrompts(newSet);
                            if (newSet.size === 0) setShowMassEditDialog(false);
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-black transition-all shadow-lg border border-white/10"
                        >
                          <X size={12} />
                        </button>
                     </div>
                   );
                 })}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Mass Content Modal --- */}
      <AnimatePresence>
        {showMassContentDialog && currentFolder && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col"
          >
            <header className="flex justify-between items-center p-6 border-b border-white/5 bg-black/20 shrink-0">
              <button 
                onClick={() => {
                  setShowMassContentDialog(false);
                  setMassContentDrafts({});
                }} 
                className="px-6 py-3 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white rounded-full transition-colors text-xs font-bold uppercase tracking-widest"
              >
                Cancel
              </button>
              <h2 className="text-xs font-bold uppercase tracking-widest text-primary">
                Edit Content ({selectedPrompts.size})
              </h2>
              <button 
                onClick={applyMassContentEdit}
                className="px-6 py-3 bg-primary text-black text-xs font-bold uppercase tracking-widest rounded-full hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Done
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#050505]">
              <div className="max-w-2xl mx-auto flex flex-col gap-4">
                 {Array.from<string>(selectedPrompts).map(name => {
                   const p = currentFolder.prompts[name];
                   if (!p) return null;
                   
                   const draft = massContentDrafts[name] || { newTitle: name, newText: p.text };
                   
                   return (
                     <MassContentEditItem
                       key={name}
                       initialTitle={draft.newTitle}
                       initialText={draft.newText}
                       media={p.media}
                       onSave={(newTitle, newText) => {
                         setMassContentDrafts(prev => ({
                           ...prev,
                           [name]: { newTitle, newText }
                         }));
                       }}
                       onRemove={() => {
                         const newSet = new Set(selectedPrompts);
                         newSet.delete(name);
                         setSelectedPrompts(newSet);
                         if (newSet.size === 0) setShowMassContentDialog(false);
                         setMassContentDrafts(prev => {
                           const next = { ...prev };
                           delete next[name];
                           return next;
                         });
                       }}
                     />
                   );
                 })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Mass Add Modal --- */}
      <AnimatePresence>
        {massAddOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col"
          >
            <header className="flex justify-between items-center p-6 border-b border-white/5 bg-black/20 shrink-0">
              <button 
                onClick={() => { setMassAddOpen(false); setMassAddItems([]); }} 
                className="p-3 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white rounded-full transition-colors"
              >
                <X size={20} />
              </button>
              <h2 className="text-xs font-bold uppercase tracking-widest text-primary">
                Mass Add Images
              </h2>
              <button 
                onClick={confirmMassAdd} 
                disabled={massAddItems.length === 0}
                className="px-6 py-3 bg-primary text-black text-xs font-bold uppercase tracking-widest rounded-full hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:hover:bg-primary"
              >
                Confirm ({massAddItems.length})
              </button>
            </header>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              <div 
                className="border-2 border-dashed border-white/20 rounded-2xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all w-full h-64 shrink-0"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleMassAddDrop}
                onClick={() => document.getElementById('mass-upload')?.click()}
              >
                <input 
                  type="file" 
                  id="mass-upload" 
                  multiple 
                  accept="image/*,video/*" 
                  className="hidden" 
                  onChange={handleMassAddUpload}
                />
                <Download size={48} className="mb-4 text-white/30" />
                <p className="text-sm font-bold uppercase tracking-widest mb-2">Drag & Drop Files Here</p>
                <p className="text-xs text-white/40">Or click to browse. Images and videos supported.</p>
              </div>

              {massAddItems.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {massAddItems.map((item, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-black border border-white/10 group flex flex-col">
                      {item.type === 'image' ? (
                        <img src={item.data} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      ) : (
                        <video src={item.data} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none p-2">
                         <span className="text-[9px] font-bold text-white px-2 py-1 bg-black/80 rounded max-w-full truncate break-all block">{item.name}</span>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setMassAddItems(prev => prev.filter((_, i) => i !== idx));
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all shadow-lg"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Hamburger / Settings Sidebar --- */}
      <AnimatePresence>
        {hamburgerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHamburgerOpen(false)}
              className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 bottom-0 w-[80vw] max-w-sm z-[70] bg-slate-900 border-l border-white/5 p-6 flex flex-col gap-8 shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between shrink-0">
                <h3 className="font-bold uppercase tracking-[0.2em] text-xs text-white/30">System Settings</h3>
                <button onClick={() => setHamburgerOpen(false)}><X size={24} /></button>
              </div>

              <div className="flex flex-col gap-4">
                 <button
                   onClick={() => {
                     setHamburgerOpen(false);
                     setMassAddOpen(true);
                   }}
                   className="w-full p-4 bg-primary/10 hover:bg-primary/20 rounded-2xl flex items-center justify-between transition-colors text-left border border-primary/20 shrink-0"
                 >
                   <div className="flex items-center gap-3">
                     <div className="p-2 rounded-xl bg-primary/20 text-primary">
                       <Images size={20} />
                     </div>
                     <span className="text-xs font-bold uppercase tracking-widest text-primary">Mass Add</span>
                   </div>
                 </button>

                 <div className="p-4 bg-white/5 rounded-2xl flex flex-col gap-3 shrink-0">
                   <label className="text-xs font-bold text-white/50 uppercase tracking-widest">Card Animation</label>
                   <div className="flex flex-col gap-2">
                     {(['flip', 'fade', 'slide-up', 'scale', 'none'] as const).map(anim => (
                       <button 
                         key={anim}
                         onClick={() => setCardAnimation(anim)}
                         className={cn("px-4 py-2 rounded-xl text-left text-xs font-bold uppercase tracking-widest transition-colors", cardAnimation === anim ? "bg-primary text-black" : "bg-black/40 text-white/50 hover:bg-black/60")}
                       >
                         {anim === 'none' ? 'Disabled' : anim}
                       </button>
                     ))}
                   </div>
                 </div>

                 <div className="p-4 bg-white/5 rounded-2xl shrink-0">
                    <div className="flex items-center justify-between">
                       <span className="text-xs font-bold uppercase tracking-widest text-white/60">Background Image</span>
                       <button 
                         onClick={() => {
                            const inp = document.createElement('input');
                            inp.type = 'file';
                            inp.accept = 'image/*';
                            inp.onchange = (e: any) => {
                              const f = e.target.files[0];
                              const r = new FileReader();
                              r.onload = ev => {
                                setBgImage(ev.target?.result as string);
                                setBgColor('transparent');
                              }
                              r.readAsDataURL(f);
                            }
                            inp.click();
                         }}
                         className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest"
                       >
                         Upload
                       </button>
                    </div>
                 </div>
                 <button
                   onClick={() => {
                     setHamburgerOpen(false);
                     setSidebarOpen(true);
                   }}
                   className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-between transition-colors text-left shrink-0"
                 >
                   <div className="flex items-center gap-3">
                     <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
                       <Trash2 size={20} />
                     </div>
                     <span className="text-xs font-bold uppercase tracking-widest text-white/80">Recycle Bin</span>
                   </div>
                   <div className="text-[10px] font-mono text-white/40">{trashData.length} Items</div>
                 </button>
                 <button
                   onClick={async () => {
                     setHamburgerOpen(false);
                     if (await showConfirm('Delete All Data', 'Are you sure you want to delete ALL data? It will be moved to the Recycle Bin.')) {
                       const newTrashItems = Object.keys(data).map(name => ({
                         id: Date.now().toString() + Math.random(),
                         type: 'folder' as const,
                         name,
                         data: data[name],
                         deletedAt: Date.now()
                       }));
                       persistTrash([...trashData, ...newTrashItems]);
                       persistData({});
                       setActiveFolderMenu(null);
                       setView('home');
                       sfx.deleted();
                     }
                   }}
                   className="w-full p-4 bg-red-500/10 hover:bg-red-500/20 rounded-2xl flex items-center justify-between transition-colors text-left border border-red-500/20 shrink-0"
                 >
                   <div className="flex items-center gap-3">
                     <div className="p-2 rounded-xl bg-red-500/20 text-red-500">
                       <Trash2 size={20} />
                     </div>
                     <span className="text-xs font-bold uppercase tracking-widest text-red-500">Delete All Data</span>
                   </div>
                 </button>
              </div>

              <div className="mt-auto space-y-3 shrink-0">
                 <button 
                   onClick={() => {
                     const inp = document.createElement('input');
                     inp.type = 'file';
                     inp.accept = '.json,application/json';
                     inp.onchange = async (e: any) => {
                       const f = e.target.files[0];
                       const text = await f.text();
                       try {
                         const parsed = JSON.parse(text);
                         const importedData = parsed.version ? parsed.data : parsed;
                         if (await showConfirm('Merge Data', 'Merge imported data with current vault?')) {
                           const merged = { ...data };
                           for (const k in importedData) {
                             if (!merged[k]) merged[k] = importedData[k];
                             else merged[k].prompts = { ...merged[k].prompts, ...importedData[k].prompts };
                           }
                           persistData(merged);
                           sfx.save();
                           alert('Vault merged successfully.');
                         }
                       } catch(err) {
                         alert('Invalid file format. Cannot import.');
                         sfx.reject();
                       }
                     };
                     inp.click();
                   }}
                   className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                 >
                   <RotateCw size={16} /> Import Records
                 </button>
                 <button 
                   onClick={() => {
                     const blob = new Blob([JSON.stringify({ version: 2, data })], {type: 'application/json'});
                     const url = URL.createObjectURL(blob);
                     const a = document.createElement('a');
                     a.href = url;
                     a.download = `vault_export_${new Date().getTime()}.json`;
                     a.click();
                   }}
                   className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                 >
                   <Download size={16} /> Export Records
                 </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- Custom Dialog --- */}
      <AnimatePresence>
        {dialog.open && (
           <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
           >
             <motion.div
               initial={{ scale: 0.95 }}
               animate={{ scale: 1 }}
               exit={{ scale: 0.95 }}
               className="w-full max-w-sm glass rounded-2xl p-6 shadow-2xl flex flex-col gap-4"
             >
               <h3 className="font-bold tracking-tight text-lg">{dialog.title}</h3>
               <p className="text-white/70 text-sm leading-relaxed">{dialog.message}</p>
               
               {dialog.type === 'prompt' && (
                 <input
                   autoFocus
                   type="text"
                   defaultValue={dialog.defaultValue}
                   id="dialog-input"
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       dialog.onConfirm(e.currentTarget.value);
                       setDialog({ ...dialog, open: false });
                       sfx.tap();
                     }
                   }}
                   className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all mt-2"
                 />
               )}
               
               <div className="flex justify-end gap-3 mt-4">
                 <button
                   onClick={() => {
                     dialog.onConfirm(dialog.type === 'confirm' ? 'no' : '');
                     setDialog({ ...dialog, open: false });
                     sfx.tap();
                   }}
                   className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all text-white/60 hover:text-white"
                 >
                   Cancel
                 </button>
                 <button
                   onClick={() => {
                     const val = dialog.type === 'prompt' ? (document.getElementById('dialog-input') as HTMLInputElement)?.value : 'yes';
                     dialog.onConfirm(val);
                     setDialog({ ...dialog, open: false });
                     sfx.tap();
                   }}
                   className={cn(
                     "px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all",
                     dialog.type === 'prompt' || dialog.title.toLowerCase().includes('delete') === false
                     ? "bg-primary text-black hover:bg-primary/90"
                     : "bg-red-500 text-white hover:bg-red-600"
                   )}
                 >
                   Confirm
                 </button>
               </div>
             </motion.div>
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
