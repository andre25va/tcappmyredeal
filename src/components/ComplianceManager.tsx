import React, { useState, useRef, useEffect } from 'react';
import {
  ClipboardCheck, Plus, Trash2, GripVertical, Star, User,
  ChevronRight, CheckCircle2, AlertCircle, Info, Pencil, Check, X,
  UserPlus, FileText, Calendar, MapPin, Copy, MoreVertical, Eye
} from 'lucide-react';

const US_STATES: { abbr: string; name: string }[] = [
  {abbr:'AL',name:'Alabama'},{abbr:'AK',name:'Alaska'},{abbr:'AZ',name:'Arizona'},{abbr:'AR',name:'Arkansas'},
  {abbr:'CA',name:'California'},{abbr:'CO',name:'Colorado'},{abbr:'CT',name:'Connecticut'},{abbr:'DE',name:'Delaware'},
  {abbr:'DC',name:'Washington D.C.'},{abbr:'FL',name:'Florida'},{abbr:'GA',name:'Georgia'},{abbr:'HI',name:'Hawaii'},
  {abbr:'ID',name:'Idaho'},{abbr:'IL',name:'Illinois'},{abbr:'IN',name:'Indiana'},{abbr:'IA',name:'Iowa'},
  {abbr:'KS',name:'Kansas'},{abbr:'KY',name:'Kentucky'},{abbr:'LA',name:'Louisiana'},{abbr:'ME',name:'Maine'},
  {abbr:'MD',name:'Maryland'},{abbr:'MA',name:'Massachusetts'},{abbr:'MI',name:'Michigan'},{abbr:'MN',name:'Minnesota'},
  {abbr:'MS',name:'Mississippi'},{abbr:'MO',name:'Missouri'},{abbr:'MT',name:'Montana'},{abbr:'NE',name:'Nebraska'},
  {abbr:'NV',name:'Nevada'},{abbr:'NH',name:'New Hampshire'},{abbr:'NJ',name:'New Jersey'},{abbr:'NM',name:'New Mexico'},
  {abbr:'NY',name:'New York'},{abbr:'NC',name:'North Carolina'},{abbr:'ND',name:'North Dakota'},{abbr:'OH',name:'Ohio'},
  {abbr:'OK',name:'Oklahoma'},{abbr:'OR',name:'Oregon'},{abbr:'PA',name:'Pennsylvania'},{abbr:'RI',name:'Rhode Island'},
  {abbr:'SC',name:'South Carolina'},{abbr:'SD',name:'South Dakota'},{abbr:'TN',name:'Tennessee'},{abbr:'TX',name:'Texas'},
  {abbr:'UT',name:'Utah'},{abbr:'VT',name:'Vermont'},{abbr:'VA',name:'Virginia'},{abbr:'WA',name:'Washington'},
  {abbr:'WV',name:'West Virginia'},{abbr:'WI',name:'Wisconsin'},{abbr:'WY',name:'Wyoming'},
];
import { ComplianceTemplate, ComplianceTemplateItem, ContactRecord } from '../types';
import { generateId } from '../utils/helpers';
import { ConfirmModal } from './ConfirmModal';
import { Button } from './ui/Button';
import { ComplianceDashboard } from './ComplianceDashboard';

interface Props {
  templates: ComplianceTemplate[];
  agentClients: ContactRecord[];
  deals: { agentClientId?: string }[];
  onSave: (templates: ComplianceTemplate[]) => void;
  masterItems?: import('../types').ComplianceMasterItem[];
  onOpenDeal?: (dealId: string) => void;
}

/* ─── Inline rename input ─────────────────────────────────────── */
const RenameInput: React.FC<{
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  placeholder?: string;
}> = ({ value, onCommit, onCancel, placeholder }) => {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  React.useEffect(() => ref.current?.focus(), []);
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        ref={ref}
        value={v}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onCommit(v.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="input input-bordered input-xs flex-1 min-w-0"
      />
      <Button variant="ghost" size="xs" square className="text-success" onClick={() => onCommit(v.trim())}><Check size={12} /></Button>
      <Button variant="ghost" size="xs" square className="text-error" onClick={onCancel}><X size={12} /></Button>
    </div>
      </div>}
  );
};

/* ─── Checklist Item Row ──────────────────────────────────────── */
const ItemRow: React.FC<{
  item: ComplianceTemplateItem;
  index: number;
  onDelete: (id: string) => void;
  onToggleRequired: (id: string) => void;
  onRename: (id: string, title: string) => void;
}> = ({ item, index, onDelete, onToggleRequired, onRename }) => {
  const [editing, setEditing] = useState(false);

  return (
    <div className={`flex items-center gap-2 group px-3 py-2.5 rounded-xl transition-colors border border-transparent hover:border-base-300 ${
      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
    } hover:bg-base-200`}>
      <GripVertical size={14} className="text-base-content/20 cursor-grab shrink-0" />
      <span className="text-xs text-base-content/30 w-5 shrink-0">{index + 1}</span>

      <div className="flex-1 min-w-0">
        {editing ? (
          <RenameInput
            value={item.title}
            onCommit={v => { if (v) onRename(item.id, v); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-black truncate">{item.title}</span>
            {item.required && (
              <span className="badge badge-xs bg-amber-100 text-amber-700 border-0 shrink-0">Required</span>
            )}
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} className="btn btn-ghost btn-xs btn-square" title="Rename">
            <Pencil size={12} />
          </button>
          <button
            onClick={() => onToggleRequired(item.id)}
            className={`btn btn-xs btn-square ${item.required ? 'text-amber-500' : 'btn-ghost text-base-content/30'}`}
            title={item.required ? 'Mark optional' : 'Mark required'}
          >
            <Star size={12} fill={item.required ? 'currentColor' : 'none'} />
          </button>
          <button onClick={() => onDelete(item.id)} className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10" title="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

/* ─── Template Editor (right panel) ──────────────────────────── */
const TemplateEditor: React.FC<{
  template: ComplianceTemplate;
  agentClients: ContactRecord[];
  dealCount: number;
  onUpdate: (t: ComplianceTemplate) => void;
  onDelete: (id: string) => void;
  masterItems: import('../types').ComplianceMasterItem[];
}> = ({ template, agentClients, dealCount, onUpdate, onDelete, masterItems }) => {
  const [items, setItems] = useState<ComplianceTemplateItem[]>(template.items);
  const [newTitle, setNewTitle] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [inspectionDays, setInspectionDays] = useState<string>(
    template.inspectionPeriodDays !== undefined ? String(template.inspectionPeriodDays) : ''
  );
  const [templateState, setTemplateState] = useState<string>(template.state ?? '');
  const [stateSearch, setStateSearch] = useState('');
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep items in sync when template changes (different template selected)
  React.useEffect(() => {
    setItems(template.items);
    setInspectionDays(template.inspectionPeriodDays !== undefined ? String(template.inspectionPeriodDays) : '');
    setTemplateState(template.state ?? '');
    setShowStateDropdown(false);
    setStateSearch('');
  }, [template.id]);

  const saveItems = (updated: ComplianceTemplateItem[]) => {
    setItems(updated);
    onUpdate({ ...template, items: updated, updatedAt: new Date().toISOString() });
  };

  const addItem = () => {
    const t = newTitle.trim();
    if (!t) return;
    const next = [...items, { id: generateId(), title: t, required: false, order: items.length, isCustom: true }];
    saveItems(next);
    setNewTitle('');
    inputRef.current?.focus();
  };

  const deleteItem = (id: string) => saveItems(items.filter(i => i.id !== id));
  const toggleRequired = (id: string) => saveItems(items.map(i => i.id === id ? { ...i, required: !i.required } : i));
  const renameItem = (id: string, title: string) => saveItems(items.map(i => i.id === id ? { ...i, title } : i));

  const saveInspectionDays = () => {
    const val = inspectionDays.trim() === '' ? undefined : parseInt(inspectionDays);
    onUpdate({ ...template, inspectionPeriodDays: isNaN(val as number) ? undefined : val, updatedAt: new Date().toISOString() });
  };

  const toggleAgent = (clientId: string) => {
    const current = template.agentClientIds ?? [];
    const next = current.includes(clientId)
      ? current.filter(id => id !== clientId)
      : [...current, clientId];
    onUpdate({ ...template, agentClientIds: next, updatedAt: new Date().toISOString() });
  };

  const saveState = (abbr: string) => {
    setTemplateState(abbr);
    setShowStateDropdown(false);
    setStateSearch('');
    onUpdate({ ...template, state: abbr || undefined, updatedAt: new Date().toISOString() });
  };

  const assignedAgents = agentClients.filter(c => (template.agentClientIds ?? []).includes(c.id));
  // Filter unassigned agents by template state (if set)
  const unassignedAgents = agentClients.filter(c => {
    if ((template.agentClientIds ?? []).includes(c.id)) return false;
    if (!templateState) return true; // no filter if no state set
    return (c.licenses ?? []).map(l => l.stateCode).includes(templateState);
  });
  const filteredStateOptions = US_STATES.filter(s =>
    s.name.toLowerCase().includes(stateSearch.toLowerCase()) ||
    s.abbr.toLowerCase().includes(stateSearch.toLowerCase())
  );
  const requiredCount = items.filter(i => i.required).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-base-300 flex-none bg-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center shrink-0">
              <FileText size={18} className="text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <RenameInput
                  value={template.name}
                  onCommit={v => {
                    if (v) onUpdate({ ...template, name: v, updatedAt: new Date().toISOString() });
                    setEditingName(false);
                  }}
                  onCancel={() => setEditingName(false)}
                  placeholder="Template name..."
                />
              ) : (
                <div className="flex items-center gap-2 group/name">
                  <h2 className="font-bold text-black text-base truncate">{template.name}</h2>
                  <button onClick={() => setEditingName(true)} className="opacity-0 group-hover/name:opacity-100 transition-opacity">
                    <Pencil size={13} className="text-base-content/40" />
                  </button>
                </div>
              )}
              {editingDesc ? (
                <RenameInput
                  value={template.description ?? ''}
                  onCommit={v => {
                    onUpdate({ ...template, description: v || undefined, updatedAt: new Date().toISOString() });
                    setEditingDesc(false);
                  }}
                  onCancel={() => setEditingDesc(false)}
                  placeholder="Add description..."
                />
              ) : (
                <div className="flex items-center gap-1 group/desc mt-0.5">
                  <p className="text-xs text-black/50 truncate">{template.description || 'Click to add description'}</p>
                  <button onClick={() => setEditingDesc(true)} className="opacity-0 group-hover/desc:opacity-100 transition-opacity">
                    <Pencil size={10} className="text-base-content/30" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-2 shrink-0 justify-end">
            <div className="text-center min-w-[36px]">
              <div className="text-base font-bold text-black">{items.length}</div>
              <div className="text-xs text-black/40">Items</div>
            </div>
            <div className="text-center min-w-[36px]">
              <div className="text-base font-bold text-amber-500">{requiredCount}</div>
              <div className="text-xs text-black/40">Req'd</div>
            </div>
            <div className="text-center min-w-[36px]">
              <div className="text-base font-bold text-primary">{assignedAgents.length}</div>
              <div className="text-xs text-black/40">Agents</div>
            </div>
            <div className="text-center min-w-[36px]">
              <div className="text-base font-bold text-success">{dealCount}</div>
              <div className="text-xs text-black/40">Deals</div>
            </div>
          </div>
        </div>

        {/* State + Inspection Period row */}
        <div className="mt-4 flex flex-wrap items-center gap-4">

          {/* State selector */}
          <div className="flex items-center gap-2 relative">
            <MapPin size={14} className="text-black/40 shrink-0" />
            <span className="text-xs font-medium text-black">State:</span>
            <button
              onClick={() => setShowStateDropdown(v => !v)}
              className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-black bg-white hover:border-gray-400 transition-colors min-w-[110px]"
            >
              {templateState ? (
                <><span className="font-semibold">{templateState}</span><span className="text-black/50"> – {US_STATES.find(s => s.abbr === templateState)?.name}</span></>
              ) : (
                <span className="text-black/40">Select state…</span>
              )}
            </button>
            {templateState && (
              <button onClick={() => saveState('')} className="btn btn-ghost btn-xs btn-square text-black/30 hover:text-error" title="Clear state">
                <X size={12} />
              </button>
            )}
            {showStateDropdown && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-64">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    value={stateSearch}
                    onChange={e => setStateSearch(e.target.value)}
                    placeholder="Search state…"
                    className="input input-bordered input-xs w-full"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredStateOptions.map(s => (
                    <button
                      key={s.abbr}
                      onClick={() => saveState(s.abbr)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                        templateState === s.abbr ? 'bg-primary/10 font-semibold' : ''
                      }`}
                    >
                      <span className="font-mono font-bold text-black/60 w-6">{s.abbr}</span>
                      <span className="text-black">{s.name}</span>
                      {templateState === s.abbr && <Check size={12} className="text-primary ml-auto" />}
                    </button>
                  ))}
                  {filteredStateOptions.length === 0 && (
                    <p className="text-xs text-black/30 text-center py-3">No states found</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Inspection Period */}
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-black/40 shrink-0" />
            <span className="text-xs font-medium text-black">Inspection Period:</span>
            <input
              type="number"
              min={1}
              max={60}
              value={inspectionDays}
              onChange={e => setInspectionDays(e.target.value)}
              onBlur={saveInspectionDays}
              onKeyDown={e => e.key === 'Enter' && saveInspectionDays()}
              placeholder="# days"
              className="input input-bordered input-xs w-20"
            />
            <span className="text-xs text-black/40">business days</span>
            {template.inspectionPeriodDays && (
              <span className="badge badge-sm bg-blue-100 text-blue-700 border-0">
                {template.inspectionPeriodDays}d
              </span>
            )}
          </div>
        </div>

        {dealCount > 0 && (
          <div className="mt-3 flex items-start gap-2 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2">
            <Info size={13} className="text-gray-500 mt-0.5 shrink-0" />
            <p className="text-xs text-black">
              Changes here only affect <strong>new deals</strong>. Existing {dealCount} deal{dealCount !== 1 ? 's' : ''} keep their current checklists.
            </p>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── Assigned Agents section ── */}
        <div className="p-4 border-b border-base-300">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <User size={14} className="text-black/50" />
              <span className="text-sm font-semibold text-black">Assigned Agents</span>
              <span className="badge badge-sm bg-gray-100 text-black border-0">{assignedAgents.length}</span>
            </div>
          </div>

          {/* Assigned list */}
          {assignedAgents.length === 0 ? (
            <p className="text-xs text-black/30 italic mb-3">No agents assigned — select from the list below</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {assignedAgents.map(agent => (
                <div key={agent.id} className="flex items-center gap-1.5 bg-secondary/10 border border-secondary/20 rounded-full pl-2 pr-1 py-1">
                  <div className="w-5 h-5 rounded-full bg-secondary text-secondary-content flex items-center justify-center text-xs font-bold shrink-0">
                    {agent.fullName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-black">{agent.fullName}</span>
                  <button
                    onClick={() => toggleAgent(agent.id)}
                    className="w-4 h-4 rounded-full bg-error/20 hover:bg-error/40 flex items-center justify-center transition-colors"
                    title="Remove"
                  >
                    <X size={10} className="text-error" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Unassigned agents to add */}
          {unassignedAgents.length > 0 && (
            <div>
              <p className="text-xs text-black/40 mb-2 font-medium">
                Add agents to this template{templateState ? ` (showing ${templateState} agents):` : ':'}
              </p>
              <div className="flex flex-wrap gap-2">
                {unassignedAgents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id)}
                    className="flex items-center gap-1.5 bg-white border border-gray-200 hover:border-secondary/40 hover:bg-secondary/5 rounded-full pl-2 pr-2 py-1 transition-colors"
                  >
                    <UserPlus size={11} className="text-secondary shrink-0" />
                    <span className="text-xs text-black">{agent.fullName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {unassignedAgents.length === 0 && agentClients.length > 0 && templateState && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-black">
                All <strong>{templateState}</strong> agent clients are already assigned. To see agents from other states, clear the state filter above.
              </p>
            </div>
          )}

          {agentClients.length === 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-black">
                No Agent Clients yet. Go to <strong>Contacts</strong> and add contacts with the <em>Agent Client</em> role.
              </p>
            </div>
          )}
        </div>

        {/* ── Master Checklist Items (read-only, toggle to include) ── */}
        <div className="p-4 border-t border-base-300">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <ClipboardCheck size={14} className="text-black/50 shrink-0" />
              <span className="text-sm font-semibold text-black whitespace-nowrap">Standard Checklist Items</span>
            </div>
            <span className="badge badge-xs bg-gray-100 text-black border-0 whitespace-nowrap">Managed in Settings</span>
            <div className="flex items-center gap-1 text-xs text-black/30 ml-auto whitespace-nowrap">
              <Star size={10} className="text-amber-400 shrink-0" fill="currentColor" />
              <span>= Required</span>
            </div>
          </div>

          {masterItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-16 gap-1 text-black/20 border-2 border-dashed border-gray-200 rounded-xl text-xs">
              <p>No master items yet — add them in <strong>Settings → Compliance Checklist</strong></p>
            </div>
          ) : (
            <div className="border border-base-300 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-base-300">
                    <th className="w-8 px-3 py-2 text-left text-xs font-semibold text-black/40">Include</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-black/40">Item</th>
                    <th className="w-16 px-3 py-2 text-center text-xs font-semibold text-black/40">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {masterItems.map((mi, idx) => {
                    const included = items.find(i => i.masterId === mi.id);
                    const toggleInclude = () => {
                      if (included) {
                        saveItems(items.filter(i => i.masterId !== mi.id));
                      } else {
                        saveItems([...items, { id: generateId(), title: mi.title, required: false, order: items.length, masterId: mi.id }]);
                      }
                    };
                    const toggleReq = () => {
                      if (!included) return;
                      saveItems(items.map(i => i.masterId === mi.id ? { ...i, required: !i.required } : i));
                    };
                    return (
                      <tr key={mi.id} className={`border-b border-base-300 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs checkbox-primary"
                            checked={!!included}
                            onChange={toggleInclude}
                          />
                        </td>
                        <td className={`px-3 py-2.5 ${included ? 'text-black font-medium' : 'text-black/40'}`}>
                          {mi.title}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {included ? (
                            <button
                              onClick={toggleReq}
                              className={`btn btn-ghost btn-xs btn-square ${included.required ? 'text-amber-400' : 'text-black/20 hover:text-amber-300'}`}
                              title={included.required ? 'Mark not required' : 'Mark required'}
                            >
                              <Star size={12} fill={included.required ? 'currentColor' : 'none'} />
                            </button>
                          ) : (
                            <span className="text-black/15">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Custom Items (template-specific) ── */}
        <div className="p-4 border-t border-base-300">
          <div className="flex items-center gap-2 mb-2">
            <Plus size={14} className="text-black/50" />
            <span className="text-sm font-semibold text-black">Custom Items</span>
            <span className="badge badge-xs bg-blue-50 text-blue-700 border border-blue-200">This template only</span>
            <span className="badge badge-sm bg-gray-100 text-black border-0">{items.filter(i => i.isCustom).length}</span>
          </div>

          {items.filter(i => i.isCustom).length === 0 ? (
            <p className="text-xs text-black/30 mb-2">No custom items yet. Add items specific to this template below.</p>
          ) : (
            <div className="space-y-0.5 mb-3">
              {items.filter(i => i.isCustom).map((item, idx) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={idx}
                  onDelete={(id) => setDeleteItemId(id)}
                  onToggleRequired={toggleRequired}
                  onRename={renameItem}
                />
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="Add a custom item for this template only…"
              className="input input-bordered input-sm flex-1 text-sm"
            />
            <button onClick={addItem} className="btn btn-primary btn-sm gap-1.5">
              <Plus size={14} /> Add
            </button>
          </div>
          <p className="text-xs text-black/30 mt-1">Tip: Press Enter to add quickly. ★ to mark required.</p>
        </div>
      </div>

      {/* Delete template footer */}
      <div className="p-4 border-t border-base-300 flex-none bg-white">
        <div className="flex items-center justify-end">
          <button onClick={() => setShowDeleteConfirm(true)} className="btn btn-ghost btn-xs text-error gap-1">
            <Trash2 size={12} /> Delete Template
          </button>
        </div>
      </div>

      {/* Confirm delete template */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title={`Delete "${template.name}"?`}
        message="This will remove the template and unassign all agents."
        confirmLabel="Yes, Delete"
        onConfirm={() => { setShowDeleteConfirm(false); onDelete(template.id); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Confirm delete custom item */}
      <ConfirmModal
        isOpen={deleteItemId !== null}
        title="Remove this item?"
        message="Remove this custom item from the template?"
        confirmLabel="Remove"
        onConfirm={() => { if (deleteItemId) { deleteItem(deleteItemId); setDeleteItemId(null); } }}
        onCancel={() => setDeleteItemId(null)}
      />
    </div>
  );
};

/* ─── New Template Modal ──────────────────────────────────────── */
const NewTemplateModal: React.FC<{
  onConfirm: (name: string) => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  React.useEffect(() => ref.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h3 className="font-bold text-black text-base mb-1">New Compliance Template</h3>
        <p className="text-xs text-black/50 mb-4">Give this template a clear name (e.g., "Illinois Standard", "Kansas City")</p>
        <input
          ref={ref}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim()) onConfirm(name.trim());
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Template name..."
          className="input input-bordered w-full mb-4"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="btn btn-primary btn-sm"
          >
            Create Template
          </button>
        </div>
      </div>
    </div>}
  </div>
  );
};

/* ─── Main ComplianceManager ──────────────────────────────────── */
export const ComplianceManager: React.FC<Props> = ({ templates, agentClients, deals, onSave, masterItems = [], onOpenDeal }) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'dashboard'>('templates');
  const [selectedId, setSelectedId] = useState<string | null>(
    templates.length > 0 ? templates[0].id : null
  );
  const [showNewModal, setShowNewModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteMenuId, setConfirmDeleteMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    if (openMenuId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  // Migrate legacy templates (agentClientId → agentClientIds)
  const migratedTemplates = React.useMemo(() => {
    return templates.map(t => {
      if (!t.agentClientIds) {
        return {
          ...t,
          name: t.name ?? (t.agentClientName ? `${t.agentClientName} Template` : 'Untitled Template'),
          agentClientIds: t.agentClientId ? [t.agentClientId] : [],
        };
      }
      return t;
    });
  }, [templates]);

  // Auto-select first if none selected
  React.useEffect(() => {
    if (!selectedId && migratedTemplates.length > 0) {
      setSelectedId(migratedTemplates[0].id);
    }
  }, [migratedTemplates]);

  const selectedTemplate = migratedTemplates.find(t => t.id === selectedId) ?? null;

  const handleCreate = (name: string) => {
    const newT: ComplianceTemplate = {
      id: generateId(),
      name,
      agentClientIds: [],
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const next = [...migratedTemplates, newT];
    onSave(next);
    setSelectedId(newT.id);
    setShowNewModal(false);
  };

  const handleUpdate = (updated: ComplianceTemplate) => {
    onSave(migratedTemplates.map(t => t.id === updated.id ? updated : t));
  };

  const handleDelete = (id: string) => {
    const next = migratedTemplates.filter(t => t.id !== id);
    onSave(next);
    setSelectedId(next.length > 0 ? next[0].id : null);
  };

  const handleDuplicate = (id: string) => {
    const src = migratedTemplates.find(t => t.id === id);
    if (!src) return;
    const copy: ComplianceTemplate = {
      ...src,
      id: generateId(),
      name: `${src.name} (Copy)`,
      agentClientIds: [],            // don't copy agent assignments
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const next = [...migratedTemplates, copy];
    onSave(next);
    setSelectedId(copy.id);
  };

  const dealCountFor = (templateId: string) => {
    const tpl = migratedTemplates.find(t => t.id === templateId);
    if (!tpl) return 0;
    return deals.filter(d => d.agentClientId && tpl.agentClientIds.includes(d.agentClientId)).length;
  };

  const agentNamesFor = (templateId: string) => {
    const tpl = migratedTemplates.find(t => t.id === templateId);
    if (!tpl || !tpl.agentClientIds.length) return [];
    return agentClients.filter(c => tpl.agentClientIds.includes(c.id)).map(c => c.fullName);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* ── Tab Header ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-base-300 bg-base-100 flex-none">
        <button
          onClick={() => setActiveTab('templates')}
          className={`btn btn-sm gap-1.5 ${activeTab === 'templates' ? 'btn-primary' : 'btn-ghost'}`}
        >
          📋 Templates
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`btn btn-sm gap-1.5 ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-ghost'}`}
        >
          🛡 Dashboard
        </button>
      </div>

      {/* ── Dashboard tab ────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-bold text-base-content">Compliance Dashboard</h2>
              <span className="text-xs text-base-content/40">— Latest AI compliance check per deal</span>
            </div>
            <ComplianceDashboard onOpenDeal={onOpenDeal} />
          </div>
        </div>
      )}

      {/* ── Templates tab ────────────────────────────────────────── */}
      {activeTab === 'templates' && <div className="flex flex-1 min-h-0 overflow-hidden">
      {showNewModal && (
        <NewTemplateModal
          onConfirm={handleCreate}
          onCancel={() => setShowNewModal(false)}
        />
      )}

      {/* ── Left panel: Template list ── */}
      <div className="w-56 md:w-64 lg:w-72 shrink-0 border-r border-base-300 flex flex-col min-h-0 bg-white">
        {/* Header */}
        <div className="p-4 border-b border-base-300 flex-none">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={16} className="text-secondary" />
              <h1 className="font-bold text-black text-sm">Compliance Templates</h1>
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="btn btn-primary btn-xs gap-1"
            >
              <Plus size={12} /> New
            </button>
          </div>
          <p className="text-xs text-black/40">
            Create templates, then assign agents. Templates auto-apply to new deals.
          </p>
        </div>

        {migratedTemplates.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-base-300 flex items-center justify-center">
              <FileText size={22} className="text-black/20" />
            </div>
            <div>
              <p className="text-sm font-semibold text-black/40">No templates yet</p>
              <p className="text-xs text-black/30 mt-1">Click <strong>+ New</strong> to create your first compliance template.</p>
            </div>
            <button onClick={() => setShowNewModal(true)} className="btn btn-primary btn-sm gap-1.5 mt-1">
              <Plus size={14} /> Create Template
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2">
            {migratedTemplates.map(tpl => {
              const active = tpl.id === selectedId;
              const agents = agentNamesFor(tpl.id);
              const dealCount = dealCountFor(tpl.id);

              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedId(tpl.id)}
                  className={`group w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-secondary/15 border border-secondary/30'
                      : 'hover:bg-base-200 border border-transparent'
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold ${
                    active ? 'bg-secondary text-secondary-content' : 'bg-base-300 text-black/50'
                  }`}>
                    <FileText size={16} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold truncate ${active ? 'text-secondary' : 'text-black'}`}>
                        {tpl.name}
                      </span>
                      {agents.length > 0 && (
                        <CheckCircle2 size={12} className="text-success shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-black/40">{tpl.items.length} item{tpl.items.length !== 1 ? 's' : ''}</span>
                      {tpl.state && (
                        <span className="badge badge-xs bg-gray-100 text-black border-0 gap-0.5">
                          <MapPin size={8} />{tpl.state}
                        </span>
                      )}
                      {agents.length > 0 && (
                        <span className="text-xs text-secondary truncate max-w-[100px]">
                          {agents.length === 1 ? agents[0] : `${agents.length} agents`}
                        </span>
                      )}
                      {dealCount > 0 && (
                        <span className="text-xs text-success">{dealCount} deal{dealCount !== 1 ? 's' : ''}</span>
                      )}
                      {tpl.inspectionPeriodDays && (
                        <span className="text-xs text-blue-500">{tpl.inspectionPeriodDays}d insp</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 relative">
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === tpl.id ? null : tpl.id); }}
                      title="Options"
                      className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 text-black/40 hover:text-black transition-opacity"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {openMenuId === tpl.id && (
                      <div
                        className="absolute right-0 top-7 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]"
                                              >
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedId(tpl.id); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-black hover:bg-gray-50"
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDuplicate(tpl.id); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-black hover:bg-gray-50"
                        >
                          <Copy size={13} /> Duplicate
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDeleteMenuId(tpl.id); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={13} /> Delete Template
                        </button>
                      </div>
                    )}
                    <ChevronRight size={14} className={active ? 'text-secondary' : 'text-black/20'} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm delete from 3-dot menu */}
      <ConfirmModal
        isOpen={confirmDeleteMenuId !== null}
        title={`Delete "${templates.find(t => t.id === confirmDeleteMenuId)?.name ?? 'this template'}"?`}
        message="This will permanently remove the template and unassign all agents."
        confirmLabel="Yes, Delete"
        onConfirm={() => { if (confirmDeleteMenuId) { handleDelete(confirmDeleteMenuId); if (selectedId === confirmDeleteMenuId) setSelectedId(null); setConfirmDeleteMenuId(null); } }}
        onCancel={() => setConfirmDeleteMenuId(null)}
      />

      {/* ── Right panel: Template editor ── */}
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {selectedTemplate ? (
          <TemplateEditor
            key={selectedTemplate.id}
            template={selectedTemplate}
            agentClients={agentClients}
            dealCount={dealCountFor(selectedTemplate.id)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            masterItems={masterItems}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-black/20">
            <ClipboardCheck size={40} />
            <p className="text-sm">Select a template or create a new one</p>
            <button onClick={() => setShowNewModal(true)} className="btn btn-primary btn-sm gap-1.5 mt-2">
              <Plus size={14} /> New Template
            </button>
          </div>
        )}
      </div>
    </div>}
  </div>
  );
};
