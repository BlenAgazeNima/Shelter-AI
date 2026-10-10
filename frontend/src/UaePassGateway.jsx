import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, ArrowLeft, Check, Smartphone } from "lucide-react";
import { PassMark } from "./ServicePanels.jsx";
import { ROLE_LABELS } from "./roles.js";
import "./uaepass-gateway.css";

export default function UaePassGateway({ api, onSession, audience }) {
  const [open, setOpen] = useState(false), [screen, setScreen] = useState("login"),
    [identifier, setIdentifier] = useState(() => localStorage.getItem("shelter-pass-identifier") || ""),
    [remember, setRemember] = useState(false), [challenge, setChallenge] = useState(null),
    [pending, setPending] = useState(null), [consent, setConsent] = useState(true),
    [copied, setCopied] = useState(false), [seconds, setSeconds] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const trigger = useRef(null), dialog = useRef(null);
  async function close() {
    if (busy) return;
    if (pending) {
      try { await api('/auth/logout', {method: 'POST', headers: {'X-CSRF-Token': pending.csrf}}); }
      catch (e) {setError(e.message);return;}
    }
    setPending(null);setOpen(false);trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {document.body.style.overflow = previous;};
  }, [open]);
  useEffect(() => {
    if (!challenge) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil(challenge.expires_at - Date.now()/1000)));
    tick();const timer = setInterval(tick,1000);return () => clearInterval(timer);
  }, [challenge]);
  async function request(event) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const next = await api('/auth/simulation/challenge', {method:'POST',body:JSON.stringify({identifier,audience})});
      if(remember)localStorage.setItem('shelter-pass-identifier', identifier.trim());else localStorage.removeItem('shelter-pass-identifier');
      setChallenge(next);setScreen('approval');
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function approve() {
    setBusy(true);setError('');
    try {
      const user = await api('/auth/simulation/complete', {method:'POST',body:JSON.stringify({identifier,audience,challenge_id:challenge.challenge_id,selected_number:challenge.number})});
      setPending(user);setConsent(true);setScreen('consent');
    } catch(e) {setError(e.message);setScreen('login');} finally {setBusy(false);}
  }
  function trap(event) {
    if(event.key === 'Escape'){event.preventDefault();close();}
    if(event.key !== 'Tab')return;
    const nodes = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(node => node.getClientRects().length);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }
  return <>
    <button ref={trigger} className="p-uae p-uae-button" onClick={() => {setOpen(true);setScreen('login');setError('');setPending(null);}}><PassMark small/>Sign in with UAE PASS</button>
    {open && createPortal(<div className="aw-pass-page" role="dialog" aria-modal="true" aria-labelledby="aw-pass-title" tabIndex={-1} ref={dialog} onKeyDown={trap}>
      <header className="aw-pass-header"><img src="/gdrfa-logo.png" alt="GDRFA Dubai"/><span>Al Awir · Shelter services</span><button onClick={close} disabled={busy}><ArrowLeft size={16}/> Back to shelter</button></header>
      <main className="aw-pass-main"><section className={'aw-pass-card ' + (screen==='login' ? 'aw-pass-login-card' : '')}>
        <div className="aw-pass-accent"/>
        {error && <p className="aw-pass-error" role="alert">{error}</p>}
        {screen==='login' && <><PassMark/><h1 id="aw-pass-title">Login to UAE PASS</h1>{audience === "employee" && <div className="aw-pass-account-hint"><span>Manager sign-in</span><code>manager@shelter.test</code><button type="button" onClick={async () => {setIdentifier("manager@shelter.test");try {await navigator.clipboard.writeText("manager@shelter.test");setCopied(true);}catch {setCopied(false);}}}>{copied ? "Copied" : "Copy & use"}</button></div>}<form onSubmit={request}><input aria-label="Emirates ID, email, or phone" placeholder="Emirates ID, email, or phone eg. 971500000000" value={identifier} onChange={e=>setIdentifier(e.target.value)} required maxLength={120} autoComplete="username" autoFocus/><label className="aw-pass-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember me</label><button className="aw-pass-login-button" disabled={busy || !identifier.trim()}>{busy ? 'Connecting…' : 'Login'}</button></form><p className="aw-pass-help">Use the identity linked to your {audience==='employee' ? 'employee account' : 'resident record'}. Your assigned permissions open the correct workspace.</p></>}
        {screen==='approval' && <><div className="aw-pass-symbol"><Smartphone size={33}/></div><p className="aw-pass-eyebrow">APPROVE SIGN IN</p><h1 id="aw-pass-title">Confirm your sign-in</h1><p className="aw-pass-lead">Confirm this matching number to continue to Al Awir services.</p><div className="aw-pass-code" aria-label={'Matching code '+challenge.number}>{challenge.number}</div><div className="aw-pass-request"><ShieldCheck size={21}/><span><strong>Al Awir Shelter Services</strong><small>{identifier}</small></span></div><p className="aw-pass-help" role="timer">{seconds>0 ? `Request expires in ${seconds}s` : 'Request expired. Return and request a new number.'}</p><button className="aw-pass-primary" disabled={busy || seconds===0} onClick={approve}>{busy ? 'Verifying…' : 'Approve and continue'}</button><button className="aw-pass-link" disabled={busy} onClick={()=>{setScreen('login');setChallenge(null);}}>Cancel</button></>}
        {screen==='consent' && pending && <><div className="aw-pass-symbol"><ShieldCheck size={33}/></div><p className="aw-pass-eyebrow">INFORMATION SHARING</p><h1 id="aw-pass-title">Continue with your information</h1><p className="aw-pass-lead">Use your saved identity and assigned permissions to open your shelter workspace.</p><div className="aw-pass-request"><span className="aw-pass-avatar">{pending.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span><span><strong>{pending.name}</strong><small>{ROLE_LABELS[pending.role]}</small></span></div><label className="aw-pass-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span><strong>Name and assigned workspace</strong><small>Only the information available in your saved shelter account is used. No documents are retrieved from UAE PASS.</small></span></label><button className="aw-pass-primary" disabled={!consent} onClick={()=>setScreen('success')}>Allow and continue</button><button className="aw-pass-link" onClick={close}>Cancel</button></>}
        {screen==='success' && pending && <><div className="aw-pass-success"><Check size={34}/></div><p className="aw-pass-eyebrow">ACCOUNT CONFIRMED</p><h1 id="aw-pass-title">Welcome, {pending.name.split(' ')[0]}</h1><p className="aw-pass-lead">Your {ROLE_LABELS[pending.role].toLowerCase()} workspace is ready.</p><button className="aw-pass-primary" onClick={()=>{setOpen(false);onSession(pending);setPending(null);}}>Continue to services</button><button className="aw-pass-link" onClick={close}>Use another account</button></>}
        <p className="aw-pass-connection">Local identity connection · No mobile notification is sent</p>
      </section></main><footer className="aw-pass-footer">UAE PASS · Al Awir Shelter Services</footer>
    </div>,document.body)}
  </>;
}
