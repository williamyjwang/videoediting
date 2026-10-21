import {useEffect, useState} from 'react';
import {App} from './App';
import {SignIn} from './SignIn';

export function Session() {
  const [authenticated, setAuthenticated] = useState<boolean>();
  const [error, setError] = useState('');
  useEffect(() => {void fetch('/api/session').then(r => {if (!r.ok) throw new Error('Could not connect to your studio.'); return r.json();}).then(s => setAuthenticated(s.authenticated)).catch(e => setError(e.message));}, []);
  if (error) return <div className="signin-page"><p role="alert">{error} Please reload to retry.</p></div>;
  if (authenticated === undefined) return <div className="signin-page">Opening your studio…</div>;
  return authenticated ? <App onSignOut={() => setAuthenticated(false)}/> : <SignIn onSuccess={() => setAuthenticated(true)}/>;
}
