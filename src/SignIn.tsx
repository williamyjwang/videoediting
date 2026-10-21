import {useState, type FormEvent} from 'react';
import {Logo} from './Logo';

export function SignIn({onSuccess}: {onSuccess: () => void}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPassword(''); onSuccess();
    } catch (e) {setError(e instanceof Error ? e.message : 'Could not sign in.');} finally {setBusy(false);}
  }
  return <main className="signin-page"><form className="signin-card" onSubmit={event => void submit(event)}><Logo width={180}/><div className="eyebrow gold">MAIN CHARACTER CLUB</div><h1>Your private<br/>editing room.</h1><p>Sign in to upload footage, shape your story, and return to your finished edits.</p><label htmlFor="password">Studio password</label><input id="password" type="password" autoComplete="current-password" value={password} required onChange={e => setPassword(e.target.value)}/>{error && <p className="signin-error" role="alert">{error}</p>}<button className="primary full" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Enter your studio'}<span>→</span></button></form></main>;
}
