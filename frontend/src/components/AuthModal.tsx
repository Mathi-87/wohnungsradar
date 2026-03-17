/**
 * AuthModal – Login und Registrierung
 *
 * Zeigt ein Modal mit Tab-Wechsel zwischen Login und Registrierung.
 * Nutzt Supabase Auth direkt über api.ts.
 */

import { useState } from 'react';
import { signIn, signUp } from '../api';

interface Props {
  onClose: () => void;
}

type Tab = 'login' | 'signup';

export function AuthModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (tab === 'login') {
        await signIn(email, password);
        onClose();
      } else {
        await signUp(email, password);
        setSuccess(
          'Registrierung erfolgreich! Bitte prüfe deine E-Mail und bestätige den Account.',
        );
      }
    } catch (err: any) {
      // Fehlermeldungen aus dem Englischen übersetzen
      const msg: string = err?.message ?? String(err);
      if (msg.includes('Invalid login credentials')) {
        setError('E-Mail oder Passwort falsch.');
      } else if (msg.includes('Email not confirmed')) {
        setError('E-Mail noch nicht bestätigt. Bitte prüfe deinen Posteingang.');
      } else if (msg.includes('already registered') || msg.includes('User already registered')) {
        setError('Diese E-Mail-Adresse ist bereits registriert.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    // Overlay
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'login' ? styles.tabActive : {}) }}
            onClick={() => { setTab('login'); setError(null); setSuccess(null); }}
          >
            Einloggen
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'signup' ? styles.tabActive : {}) }}
            onClick={() => { setTab('signup'); setError(null); setSuccess(null); }}
          >
            Registrieren
          </button>
        </div>

        {/* Formular */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>E-Mail-Adresse</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={styles.input}
              placeholder="name@example.ch"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={styles.input}
              placeholder="Mindestens 6 Zeichen"
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.successMsg}>{success}</div>}

          {!success && (
            <button type="submit" disabled={loading} style={styles.btn}>
              {loading ? 'Bitte warten...' : tab === 'login' ? 'Einloggen' : 'Account erstellen'}
            </button>
          )}
        </form>

        {tab === 'signup' && !success && (
          <p style={styles.hint}>
            Nach der Registrierung erhältst du eine Bestätigungs-E-Mail.
          </p>
        )}

        <button onClick={onClose} style={styles.closeBtn} aria-label="Schliessen">✕</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '32px',
    width: '100%',
    maxWidth: '420px',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '24px',
    backgroundColor: '#f4f6f9',
    borderRadius: '8px',
    padding: '4px',
  },
  tab: {
    flex: 1,
    padding: '8px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#6c757d',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  tabActive: {
    backgroundColor: '#fff',
    color: '#1a2332',
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '14px', fontWeight: 500, color: '#495057' },
  input: {
    padding: '10px 12px',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
  },
  error: {
    padding: '10px 12px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '8px',
    fontSize: '13px',
  },
  successMsg: {
    padding: '10px 12px',
    backgroundColor: '#d4edda',
    color: '#155724',
    borderRadius: '8px',
    fontSize: '13px',
  },
  btn: {
    padding: '12px',
    backgroundColor: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '4px',
  },
  hint: { fontSize: '12px', color: '#6c757d', marginTop: '12px', textAlign: 'center' },
  closeBtn: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#6c757d',
    padding: '4px',
    lineHeight: 1,
  },
};
