import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Link, useNavigate } from 'react-router-dom';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from 'sonner';

interface Patient {
  id: string;
  name: string;
  identifiers: any;
}

interface PatientMentionProps {
  value: string;
  onChange: (value: string) => void;
  onSelectPatient?: (patientId: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function PatientMentionInput({ 
  value, 
  onChange, 
  onSelectPatient,
  onKeyDown,
  disabled = false,
  placeholder = "Type your message... Use @id to mention a patient",
  className = ""
}: PatientMentionProps) {
  const { clinicId } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load patients when typing @id, sorted by most recent consults
  useEffect(() => {
    if (!clinicId) return;
    
    const match = value.match(/@id(\w*)\s*$/i);
    if (match) {
      const query = match[1];
      setMentionQuery(query);
      setShowSuggestions(true);
      
      (async () => {
        // 1) Get recent consults to rank patients by recency
        const { data: consults } = await supabase
          .from('consults')
          .select('patient_id, started_at')
          .eq('clinic_id', clinicId)
          .order('started_at', { ascending: false })
          .limit(200);
        const rank = new Map<string, number>();
        (consults || []).forEach((c: any, idx: number) => {
          if (c.patient_id && !rank.has(c.patient_id)) rank.set(c.patient_id, idx);
        });

        // 2) Load patients for this clinic (bigger window, we filter client-side)
        const { data: patientRows } = await supabase
          .from('patients')
          .select('id, name, identifiers')
          .eq('clinic_id', clinicId)
          .order('updated_at', { ascending: false })
          .limit(200);

        if (patientRows) {
          let filtered = patientRows;
          if (query) {
            filtered = patientRows.filter((p: any) => {
              const identifiers = p.identifiers as Record<string, any> | null;
              const patientId = identifiers?.patient_id || p.id.substring(0, 8);
              return String(patientId).toLowerCase().includes(query.toLowerCase()) ||
                     (p.name || '').toLowerCase().includes(query.toLowerCase());
            });
          }

          // 3) Sort by most recent consult rank, then by name
          filtered.sort((a: any, b: any) => {
            const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.POSITIVE_INFINITY;
            const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.POSITIVE_INFINITY;
            if (ra !== rb) return ra - rb; // lower index = more recent
            return (a.name || '').localeCompare(b.name || '');
          });

          setPatients(filtered.slice(0, 20));
        }
      })();
    } else {
      setShowSuggestions(false);
    }
  }, [value, clinicId]);

  const selectPatient = (patient: Patient) => {
    const identifiers = patient.identifiers as Record<string, any> | null;
    // Use patient_id from identifiers, or fallback to short UUID
    const patientId = identifiers?.patient_id || patient.id.substring(0, 8);
    // Store the mention with hidden UUID data attribute
    const mentionText = `@id${patientId}`;
    const mentionWithData = `${mentionText}[${patient.id}]`;
    const newValue = value.replace(/@id\w*\s*$/, `${mentionWithData} `);
    onChange(newValue);
    setShowSuggestions(false);
    
    if (onSelectPatient) {
      onSelectPatient(patient.id);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyUp={(e) => setCursorPosition(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full min-h-[100px] p-3 border rounded-md resize-none ${className}`}
      />
      
      {showSuggestions && patients.length > 0 && (
        <div className="absolute bottom-full mb-2 w-full max-w-sm bg-background border rounded-md shadow-lg z-50">
          <Command>
            <CommandList>
              <CommandGroup heading="Patients">
                {patients.map((patient) => {
                  const identifiers = patient.identifiers as Record<string, any> | null;
                  const patientId = identifiers?.patient_id || patient.id.substring(0, 8);
                  return (
                    <CommandItem
                      key={patient.id}
                      onSelect={() => selectPatient(patient)}
                      className="cursor-pointer"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{patient.name}</span>
                        <span className="text-xs text-muted-foreground">ID: {patientId}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {patients.length === 0 && (
                <CommandEmpty>No patients found</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}

// Component to render text with patient mentions as clickable links
export function PatientMentionText({ text, isOwnMessage = false }: { text: string; isOwnMessage?: boolean }) {
  const navigate = useNavigate();
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  const handleNavigate = (patientUuid: string) => {
    navigate(`/patients/${patientUuid}`);
  };

  // Parse mentions in format @id123[uuid]
  const parts: Array<{ type: 'text' | 'mention'; content: string; uuid?: string }> = [];
  
  // Collect UUIDs for lookup
  const uuidMatches = Array.from(text.matchAll(/@id(\w+)\(([a-f0-9-]+)\)|@id(\w+)\[([a-f0-9-]+)\]/g));
  const uuids = Array.from(new Set(uuidMatches.map((m) => m[2] || m[4]).filter(Boolean)));

  // Fetch names for mentioned patients
  useEffect(() => {
    const missing = uuids.filter((id) => id && !nameMap[id]);
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('patients')
        .select('id, name')
        .in('id', missing as string[]);
      if (data) {
        setNameMap((prev) => {
          const next = { ...prev } as Record<string, string>;
          data.forEach((p: any) => { next[p.id] = p.name; });
          return next;
        });
      }
    })();
  }, [text]);

  let lastIndex = 0;
  const mentionRegex = /@id(\w+)\(([a-f0-9-]+)\)|@id(\w+)\[([a-f0-9-]+)\]/g;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    const uuid = match[2] || match[4];
    parts.push({ type: 'mention', content: `@id${match[1] || match[3]}`, uuid });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  if (parts.length === 0) {
    return <>{text}</>;
  }

  const linkClasses = isOwnMessage 
    ? "font-medium underline underline-offset-2 hover:opacity-80 text-primary-foreground"
    : "text-primary font-medium underline underline-offset-2 hover:text-primary/80";

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'mention' && part.uuid) {
          const display = nameMap[part.uuid] || part.content;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleNavigate(part.uuid!)}
              className={linkClasses}
              title={nameMap[part.uuid] ? `${part.content} → ${nameMap[part.uuid]}` : undefined}
            >
              {display}
            </button>
          );
        }
        return <span key={i}>{part.content}</span>;
      })}
    </>
  );
}
