import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Car, Users, Calendar, Plus, LogOut, Settings, Loader2, ChevronRight, CheckCircle2, MapPin, Clock4, UserPlus, ShieldCheck } from "lucide-react";
import { SteeringWheel } from "./components/SteeringWheel";

// shadcn/ui components
import { Button } from "./components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/Card";
import { Input } from "./components/ui/Input";
import { Label } from "./components/ui/Label";
import { Textarea } from "./components/ui/Textarea";
import { Avatar, AvatarFallback } from "./components/ui/Avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/Dialog";
import { Badge } from "./components/ui/Badge";
import { Separator } from "./components/ui/Separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/Select";
import { Toaster } from "./components/ui/Sonner";
import { toast } from "sonner";

// --- Firebase (SDK v9 modular) ---
// IMPORTANT: replace with your own Firebase config. For local dev, keep env vars.
// Netlify: add environment variables in Site Settings > Build & Deploy > Environment.
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, query, where, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --------------------
// Types
// --------------------
export type Member = { id: string; name: string; photoURL?: string | null; email?: string | null };
export type Ride = {
  id?: string;
  groupId: string;
  date: string; // ISO date
  from: string;
  to: string;
  participants: string[]; // member ids present
  driverId: string; // chosen driver
};
export type Group = {
  id: string;
  name: string;
  code: string; // invite code
  ownerId: string;
  members: Member[];
};

// --------------------
// Simple Fairness Engine
// --------------------
/**
 * Compute the next fair driver among "present" members using a history of rides.
 * Strategy:
 *  - Count drives per member (in this group) across history.
 *  - Use a recency decay so very old rides comptent moins (ex: weight = 0.9^months_since).
 *  - Prefer members in `present` who have the lowest weighted count.
 *  - Tie-breaker: who hasn't driven for the longest time.
 */
function nextDriver({ present, history, nowISO }: { present: string[]; history: Ride[]; nowISO?: string }) {
  if (!present.length) return null;
  const now = nowISO ? new Date(nowISO) : new Date();
  const counts = new Map<string, number>();
  const lastDates = new Map<string, number>(); // epoch ms of last drive

  // init
  for (const m of present) {
    counts.set(m, 0);
    lastDates.set(m, 0);
  }

  const DECAY = 0.92; // monthly decay
  for (const r of history) {
    const d = new Date(r.date);
    const months = Math.max(0, (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const weight = Math.pow(DECAY, months);
    if (counts.has(r.driverId)) {
      counts.set(r.driverId, (counts.get(r.driverId) || 0) + 1 * weight);
      lastDates.set(r.driverId, Math.max(lastDates.get(r.driverId) || 0, d.getTime()));
    }
  }

  // find minimal weighted count among present
  const sorted = [...present].sort((a, b) => {
    const ca = counts.get(a) ?? 0;
    const cb = counts.get(b) ?? 0;
    if (ca !== cb) return ca - cb; // fewer weighted drives first
    // tie-breaker: older last drive first
    const la = lastDates.get(a) ?? 0;
    const lb = lastDates.get(b) ?? 0;
    return la - lb;
  });

  return sorted[0];
}

// --------------------
// UI Helpers
// --------------------
function AvatarBubble({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Avatar className="h-8 w-8">
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

function PageShell({ children, user }: { children: React.ReactNode; user: User | null }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white text-slate-900">
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-black text-white shadow">
              <SteeringWheel className="h-5 w-5" />
            </div>
            <span>Carpool Fair</span>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <Button variant="ghost" onClick={() => signOut(auth)} className="gap-2">
                <LogOut className="h-4 w-4" /> Se déconnecter
              </Button>
            ) : (
              <Button onClick={() => signInWithPopup(auth, provider)} className="gap-2">
                <ShieldCheck className="h-4 w-4" /> Connexion Google
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/settings")} className="gap-2">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <Toaster richColors />
    </div>
  );
}

// --------------------
// Auth Gate
// --------------------
function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);
  return { user, loading };
}

// --------------------
// Mocked Firestore queries (minimal viable wiring)
// In production, create collections: groups, rides, memberships.
// --------------------
async function createGroup(name: string, ownerId: string) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const ref = doc(collection(db, "groups"));
  const g: Group = { id: ref.id, name, code, ownerId, members: [] };
  await setDoc(ref, g);
  return g;
}

function useMyGroups(userId: string | undefined) {
  const [groups, setGroups] = useState<Group[]>([]);
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "groups"), where("ownerId", "==", userId));
    const unsub = onSnapshot(q, (snap) => {
      const arr: Group[] = [];
      snap.forEach((d) => arr.push(d.data() as Group));
      setGroups(arr);
    });
    return unsub;
  }, [userId]);
  return groups;
}

// --------------------
// Pages
// --------------------
function Dashboard({ user }: { user: User }) {
  const groups = useMyGroups(user.uid);

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Bienvenue, {user.displayName?.split(" ")[0] || ""} 👋</CardTitle>
            <CardDescription>Gère tes groupes de covoiturage et répartis la conduite équitablement.</CardDescription>
          </div>
          <CreateGroupDialog user={user} />
        </CardHeader>
      </Card>

      {groups.map((g) => (
        <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> {g.name}
              </CardTitle>
              <CardDescription>Code d'invitation: <Badge variant="secondary">{g.code}</Badge></CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Car className="h-4 w-4" /> {g.members?.length || 1} membre(s)
              </div>
              <Link to={`/group/${g.id}`} className="inline-flex items-center gap-1 text-sm font-medium">
                Ouvrir <ChevronRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      ))}

      {groups.length === 0 && (
        <Card className="md:col-span-2 lg:col-span-3">
          <CardContent className="p-8 flex items-center gap-6">
            <div className="rounded-2xl p-4 bg-slate-50">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Crée ton premier groupe</h3>
              <p className="text-slate-600 mb-3">Invite tes collègues et commence à planifier vos trajets.</p>
              <CreateGroupDialog user={user} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateGroupDialog({ user }: { user: User }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" /> Nouveau groupe
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un groupe</DialogTitle>
          <DialogDescription>Donne un nom à ton groupe (équipe, service, promo...).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nom du groupe</Label>
            <Input placeholder="Ex: MMI Covoit" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!name || loading}
            onClick={async () => {
              try {
                setLoading(true);
                const g = await createGroup(name.trim(), user.uid);
                toast.success("Groupe créé", { description: `Code d'invitation: ${g.code}` });
                setName("");
              } catch (e: any) {
                console.error(e);
                toast.error("Impossible de créer le groupe");
              } finally {
                setLoading(false);
              }
            }}
            className="gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupPage({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [present, setPresent] = useState<string[]>([]);

  useEffect(() => {
    const unsubGroup = onSnapshot(doc(db, "groups", groupId), (snap) => {
      const g = snap.data() as Group | undefined;
      if (g) setGroup(g);
    });
    const unsubRides = onSnapshot(collection(db, "groups", groupId, "rides"), (snap) => {
      const arr: Ride[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as Ride) }));
      // sort recent first
      arr.sort((a, b) => (a.date < b.date ? 1 : -1));
      setRides(arr);
    });
    return () => {
      unsubGroup();
      unsubRides();
    };
  }, [groupId]);

  const suggestedDriver = useMemo(() => {
    return nextDriver({ present: present.length ? present : (group?.members?.map((m) => m.id) || []), history: rides });
  }, [present, rides, group]);

  if (!group)
    return (
      <div className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
    );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Users className="h-5 w-5" /> {group.name}
            </CardTitle>
            <CardDescription>Code d'invitation: <Badge variant="secondary">{group.code}</Badge></CardDescription>
          </div>
          <AddRideDialog group={group} present={present} />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {(group.members?.length ? group.members : [{ id: "owner", name: "Toi" } as Member]).map((m) => (
              <button
                key={m.id}
                onClick={() =>
                  setPresent((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]))
                }
                className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
                  present.includes(m.id) ? "border-black bg-black text-white" : "hover:bg-slate-50"
                }`}
              >
                <AvatarBubble name={m.name} />
                <span className="text-sm">{m.name}</span>
              </button>
            ))}
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Calendar className="h-4 w-4" />
              <span>Suggéré aujourd'hui :</span>
              <Badge className="gap-1" variant="outline">
                <SteeringWheel className="h-3 w-3" /> {group.members?.find((m) => m.id === suggestedDriver)?.name || "—"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5" /> Historique des trajets</CardTitle>
          <CardDescription>Le conducteur avec le moins de trajets récents est prioritaire.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {rides.length === 0 && (
            <div className="rounded-xl border bg-slate-50 p-6 text-sm text-slate-600">
              Aucun trajet pour le moment. Ajoute le premier via « Ajouter un trajet ».
            </div>
          )}
          <div className="grid gap-3">
            {rides.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl p-2 bg-slate-50">
                    <Car className="h-4 w-4" />
                  </div>
                  <div className="leading-tight">
                    <div className="font-medium flex items-center gap-2">
                      {new Date(r.date).toLocaleDateString()} <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {r.from} → {r.to}</Badge>
                    </div>
                    <div className="text-sm text-slate-600 flex items-center gap-2">
                      <Clock4 className="h-3 w-3" /> Participants: {r.participants.length} — Conducteur: <span className="font-medium">{group.members?.find((m) => m.id === r.driverId)?.name || "—"}</span>
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="gap-1"><SteeringWheel className="h-3 w-3" /> Conduit</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AddRideDialog({ group, present }: { group: Group; present: string[] }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Ajouter un trajet</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau trajet</DialogTitle>
          <DialogDescription>Sélectionne les infos du trajet et valide.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Depuis</Label>
            <Input placeholder="Ex: Lille" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Vers</Label>
            <Input placeholder="Ex: Roubaix" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Participants</Label>
            <div className="flex flex-wrap gap-2">
              {(group.members?.length ? group.members : [{ id: "owner", name: "Toi" } as Member]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    const exists = present.includes(m.id);
                    toast.info("Sélection via le header du groupe ↑", { description: exists ? `${m.name} était déjà sélectionné` : `${m.name} n'était pas sélectionné` })
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                    present.includes(m.id) ? "border-black bg-black text-white" : "hover:bg-slate-50"
                  }`}
                >
                  <AvatarBubble name={m.name} /> {m.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">Astuce : sélectionne/désélectionne les participants depuis la section au-dessus du bouton.</p>
          </div>
          <div className="grid gap-2">
            <Label>Conducteur suggéré</Label>
            <Select disabled>
              <SelectTrigger>
                <SelectValue placeholder="Calcul automatique" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">L'algo choisit automatiquement la personne la plus équitable parmi les présents.</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!from || !to || !date || present.length === 0}
            onClick={async () => {
              const driverId = nextDriver({ present, history: [] }) || present[0];
              try {
                const ref = await addDoc(collection(db, "groups", group.id, "rides"), {
                  groupId: group.id,
                  date: new Date(date).toISOString(),
                  from,
                  to,
                  participants: present,
                  driverId,
                  createdAt: serverTimestamp(),
                } satisfies Ride as any);
                toast.success("Trajet ajouté", { description: `Conducteur: ${group.members?.find((m)=>m.id===driverId)?.name || "—"}` });
                setOpen(false);
                setFrom("");
                setTo("");
              } catch (e) {
                console.error(e);
                toast.error("Erreur lors de l'ajout du trajet");
              }
            }}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" /> Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsPage() {
  return (
    <div className="grid gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Préférences</CardTitle>
          <CardDescription>Réglages de l'application.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nom par défaut du trajet</Label>
            <Input placeholder="Maison → Travail" />
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea placeholder="Règles internes, préférences, etc." />
          </div>
          <Button className="w-fit">Enregistrer</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>À propos</CardTitle>
          <CardDescription>Stack: React + Tailwind + shadcn/ui + Firebase + Netlify</CardDescription>
        </CardHeader>
        <CardContent className="prose prose-slate max-w-none text-sm">
          <ul className="list-disc pl-6">
            <li>Design mobile-first, coins 2xl, ombres douces</li>
            <li>Animations Framer Motion discrètes</li>
            <li>Système d'équité avec décote temporelle</li>
            <li>Collections Firestore: <code>groups</code>, <code>groups/{'{groupId}'}/rides</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// --------------------
// Router wrapper
// --------------------
function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen grid place-items-center">
      <div className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
    </div>
  );

  return (
    <BrowserRouter>
      <PageShell user={user}>
        {!user ? (
          <Landing />
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/group/:id" element={<GroupRoute />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </PageShell>
    </BrowserRouter>
  );
}

function GroupRoute() {
  const id = window.location.pathname.split("/").pop() || "";
  return <GroupPage groupId={id} />;
}

function Landing() {
  return (
    <div className="grid gap-10 md:grid-cols-2 items-center">
      <div className="space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
          <ShieldCheck className="h-4 w-4" /> Auth Google prête à l'emploi
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight">Répartis la conduite <span className="bg-gradient-to-r from-black to-slate-500 bg-clip-text text-transparent">équitablement</span>.</h1>
        <p className="text-slate-600">Crée un groupe, invite tes collègues, puis laisse l'algorithme choisir le conducteur le plus juste à chaque trajet — même si vous n'êtes pas le même nombre chaque jour.</p>
        <div className="flex gap-3">
          <Button onClick={() => signInWithPopup(auth, provider)} className="gap-2"><GoogleIcon /> Continuer avec Google</Button>
          <Button variant="outline" asChild><a href="#features">En savoir plus</a></Button>
        </div>
        <div id="features" className="grid grid-cols-2 gap-3 pt-4">
          <Feature icon={<Car className="h-4 w-4" />} title="Trajets rapides" desc="Ajout en 10 secondes" />
          <Feature icon={<Users className="h-4 w-4" />} title="Groupes" desc="Invitations par code" />
          <Feature icon={<SteeringWheel className="h-4 w-4" />} title="Équité" desc="Algo transparent" />
          <Feature icon={<Calendar className="h-4 w-4" />} title="Historique" desc="Vue détaillée" />
        </div>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border bg-white p-6 shadow-sm">
        <MockPreviewCard />
      </motion.div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">{icon}</div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-slate-600">{desc}</div>
    </div>
  );
}

function MockPreviewCard() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">MMI Crew</div>
        <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" /> 5</Badge>
      </div>
      <div className="rounded-2xl border p-4">
        <div className="text-sm text-slate-600 mb-2">Conducteur suggéré</div>
        <div className="flex items-center gap-3">
          <AvatarBubble name="Camille Dupont" />
          <div>
            <div className="font-medium">Camille Dupont</div>
            <div className="text-sm text-slate-600">Moins de trajets récents</div>
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        {["Lun 26/08", "Mar 27/08", "Mer 28/08"].map((d) => (
          <div key={d} className="flex items-center justify-between rounded-xl border p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl p-2 bg-slate-50"><Car className="h-4 w-4" /></div>
              <div className="leading-tight">
                <div className="font-medium">{d} — Maison → Campus</div>
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Clock4 className="h-3 w-3" /> 4 participants — Conducteur: <span className="font-medium">Alex</span>
                </div>
              </div>
            </div>
            <Badge variant="outline" className="gap-1"><SteeringWheel className="h-3 w-3" /> OK</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid place-items-center py-20 text-center">
      <div className="space-y-3">
        <div className="text-7xl">🤷‍♂️</div>
        <h2 className="text-2xl font-semibold">Page introuvable</h2>
        <p className="text-slate-600">Reviens à l'accueil pour continuer.</p>
        <Button asChild><a href="/">Accueil</a></Button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4">
      <path d="M44.5 20H24v8.5h11.8C34.9 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.6 4.6 29.6 2.5 24 2.5 12.1 2.5 2.5 12.1 2.5 24S12.1 45.5 24 45.5 45.5 35.9 45.5 24c0-1.3-.1-2.1-.3-4z"/>
    </svg>
  );
}

export default function App() {
  return <AppRouter />;
}

// Render if used standalone in Vite preview
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
