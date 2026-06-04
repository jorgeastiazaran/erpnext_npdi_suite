import React, { useState, useRef, useEffect } from 'react';
import { Search, User as UserIcon } from 'lucide-react';

interface UserOption {
  email: string;
  full_name: string;
}

interface UserAutocompleteProps {
  users: UserOption[];
  value: string; // The selected email
  onChange: (email: string) => void;
}

export default function UserAutocomplete({ users, value, onChange }: UserAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // set initial search text based on value
  useEffect(() => {
    if (value) {
      const u = users.find(u => u.email === value);
      if (u) setSearch(`${u.full_name} (${u.email})`);
    } else {
      setSearch('');
    }
  }, [value, users]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset search if they didn't pick anything
        const u = users.find(u => u.email === value);
        setSearch(u ? `${u.full_name} (${u.email})` : '');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value, users]);

  const filteredUsers = users.filter(u => 
    u.full_name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Buscar usuario..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
            if (e.target.value === '') onChange(''); // clear selection
          }}
          onFocus={() => setIsOpen(true)}
          style={{
            width: '100%',
            padding: '10px 14px',
            paddingRight: '30px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '14px',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <Search size={16} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          maxHeight: '200px',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 10,
        }}>
          {filteredUsers.length > 0 ? (
            filteredUsers.map(u => (
              <div
                key={u.email}
                onClick={() => {
                  onChange(u.email);
                  setSearch(`${u.full_name} (${u.email})`);
                  setIsOpen(false);
                }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface-2, #f0f0f0)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <UserIcon size={14} style={{ color: 'var(--text-muted)' }} />
                <div>
                  <div style={{ fontWeight: 500 }}>{u.full_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--text-muted)' }}>
              No se encontraron usuarios
            </div>
          )}
        </div>
      )}
    </div>
  );
}
