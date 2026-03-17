import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  CheckCircle2, Circle, Plus, Trash2, ClipboardList, Shield,
  Star, AlertCircle, Home, Eye, EyeOff, Pencil, Check, X, Lock, ChevronRight,
  MoreVertical, StickyNote, User, RotateCcw, GripVertical,
} from 'lucide-react';
import { Deal, ComplianceTemplate, ChecklistItem, AppUser, ContactRecord } from '../types';
import { checklistProgress, generateId, formatDate, daysUntil } from '../utils/helpers';
import { ConfirmModal } from './ConfirmModal';
import { SmartChecklistSuggestions } from './SmartChecklistSuggestions';

interface Props { deal: Deal; onUpdate: (d: Deal) => void; users?: AppUser[]; contactRecords?: ContactRecord[]; complianceTemplates?: any[]; }
