import { useRef, useState } from "react";
import Landing from "./Components/Landing";
import { Report, Success, MyComplaints, Detail, PublicDashboard, Drafts } from "./Components/citizen";
import { Overview, Assigned, Escalation } from "./Components/official";
import { CitizenShell, OfficialShell } from "./Components/ui";
import { useTheme } from "./Components/theme";
import { complaints } from "./Components/data";

const STORAGE_KEY = "civicsync.complaints";
const DRAFTS_KEY = "civicsync.drafts";
const AUTH_KEY = "civicsync.demo-session";

function loadDemoAuth() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUTH_KEY) || "null");
    if (!stored || !["public", "official"].includes(stored.role) || typeof stored.email !== "string") {
      return { auth: null, error: "" };
    }
    return { auth: stored, error: "" };
  } catch (error) {
    return { auth: null, error: `Demo session could not be loaded: ${error.message}` };
  }
}

function loadSavedComplaints() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], error: "" };
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.some((item) =>
      !item || typeof item.id !== "string" || typeof item.title !== "string" ||
      typeof item.category !== "string" || !Array.isArray(item.photos))) {
      throw new Error("Saved complaint data has an unexpected format.");
    }
    return { items, error: "" };
  } catch (error) {
    return { items: [], error: `Saved complaints could not be loaded: ${error.message}` };
  }
}

function loadSavedDrafts() {
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return { items: [], error: "" };
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.some((item) =>
      !item || typeof item.id !== "string" || !Array.isArray(item.photos))) {
      throw new Error("Saved draft data has an unexpected format.");
    }
    return { items, error: "" };
  } catch (error) {
    return { items: [], error: `Saved drafts could not be loaded: ${error.message}` };
  }
}

async function photoToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
    if (!blob) throw new Error("The selected photo could not be processed.");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("The selected photo could not be read."));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

export default function App() {
  const [theme, toggle] = useTheme();
  const [route, setRoute] = useState({ page: "landing" });
  const [authData, setAuthData] = useState(loadDemoAuth);
  const [accessNotice, setAccessNotice] = useState(authData.error);
  const [savedData, setSavedData] = useState(loadSavedComplaints);
  const [draftData, setDraftData] = useState(loadSavedDrafts);
  const [storageError, setStorageError] = useState([savedData.error, draftData.error].filter(Boolean).join(" "));
  const [created, setCreated] = useState(null);
  const nextComplaintNumber = useRef(Math.max(1071, ...savedData.items.map((item) => Number(item.id.split("-").at(-1)) || 0)) + 1);
  const go = (page, id) => {
    if (["report", "mine", "drafts"].includes(page) && authData.auth?.role !== "public") {
      setAccessNotice("Sign in or sign up as Public / Citizen before using the complaint portal.");
      setRoute({ page: "landing" });
      window.scrollTo(0, 0);
      return;
    }
    if (["overview", "assigned", "escalation"].includes(page) && authData.auth?.role !== "official") {
      setAccessNotice("Sign in or sign up as Official to open the Official Dashboard.");
      setRoute({ page: "landing" });
      window.scrollTo(0, 0);
      return;
    }
    setAccessNotice("");
    setRoute({ page, id });
    window.scrollTo(0, 0);
  };
  const signIn = (session) => {
    try {
      window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));
      setAuthData({ auth: session, error: "" });
      setAccessNotice("");
      setRoute({ page: session.role === "official" ? "overview" : "public" });
      window.scrollTo(0, 0);
    } catch (error) {
      setAccessNotice(`Could not save this demo session in your browser: ${error.message}`);
    }
  };
  const signOut = () => {
    try {
      window.localStorage.removeItem(AUTH_KEY);
      setAuthData({ auth: null, error: "" });
      setAccessNotice("You have signed out.");
      setRoute({ page: "landing" });
      window.scrollTo(0, 0);
    } catch (error) {
      setAccessNotice(`Could not clear the demo session: ${error.message}`);
    }
  };
  const allComplaints = [...new Map([...complaints, ...savedData.items].map((item) => [item.id, item])).values()];
  const mine = [...new Map([
    ...complaints.filter((c) => ["SHG-2026-1042", "SHG-2026-1057", "SHG-2026-1061"].includes(c.id)),
    ...savedData.items,
  ].map((item) => [item.id, item])).values()];

  const submit = async (f, draftId) => {
    try {
      const photoData = await Promise.all(f.photos.map((photo) => photo.data || photoToDataUrl(photo.file)));
      const now = new Date();
      const deadline = new Date(now);
      deadline.setDate(deadline.getDate() + 7);
      const c = {
        id: `SHG-${now.getFullYear()}-${nextComplaintNumber.current}`,
        title: f.title.trim(),
        category: f.category,
        desc: f.desc.trim(),
        photos: photoData,
        location: f.location,
        ward: f.location.address.trim() || `GPS: ${f.location.latitude.toFixed(5)}, ${f.location.longitude.toFixed(5)}`,
        address: f.location.address.trim(),
        createdAt: now.toISOString(),
        events: [{ title: "Complaint submitted", createdAt: now.toISOString() }],
        priority: "High",
        deadline: deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        remaining: "7d left",
        status: "Submitted",
        level: "L0 - Officer",
      };
      const items = [c, ...savedData.items];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      setSavedData({ items, error: "" });
      if (draftId) {
        const drafts = draftData.items.filter((draft) => draft.id !== draftId);
        try {
          window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
          setDraftData({ items: drafts, error: "" });
          setStorageError("");
        } catch (error) {
          setStorageError(`Complaint submitted, but its saved draft could not be removed: ${error.message}`);
        }
      } else {
        setStorageError("");
      }
      nextComplaintNumber.current += 1;
      setCreated(c);
      go("success");
      return true;
    } catch (error) {
      setStorageError(`Complaint could not be saved. Check browser storage and photo permissions, then try again. ${error.message}`);
      return false;
    }
  };
  const refreshComplaints = () => {
    const loaded = loadSavedComplaints();
    setSavedData(loaded);
    setStorageError(loaded.error);
  };
  const addEvidence = async (complaintId, files) => {
    try {
      const current = [...savedData.items, ...complaints].find((item) => item.id === complaintId);
      if (!current) throw new Error("The complaint could not be found.");
      const currentPhotos = current.photos || [];
      if (currentPhotos.length + files.length > 4) {
        throw new Error("A complaint can have up to 4 photos. Remove some existing evidence first.");
      }
      const evidence = await Promise.all(files.map(photoToDataUrl));
      const updated = {
        ...current,
        photos: [...currentPhotos, ...evidence],
        evidenceUpdatedAt: new Date().toISOString(),
        events: [...(current.events || []), { title: "Evidence added", createdAt: new Date().toISOString() }],
      };
      const items = [updated, ...savedData.items.filter((item) => item.id !== complaintId)];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      setSavedData({ items, error: "" });
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError(`Evidence could not be saved. ${error.message}`);
      return false;
    }
  };
  const updateComplaint = (complaintId, changes, eventLabel) => {
    try {
      const current = allComplaints.find((item) => item.id === complaintId);
      if (!current) throw new Error("The complaint could not be found.");
      const now = new Date().toISOString();
      const updated = {
        ...current,
        ...changes,
        lastEvent: eventLabel,
        events: [...(current.events || []), { title: eventLabel, createdAt: now }],
      };
      const items = [updated, ...savedData.items.filter((item) => item.id !== complaintId)];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      setSavedData({ items, error: "" });
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError(`Complaint could not be updated. ${error.message}`);
      return false;
    }
  };
  const updateStatus = (complaintId, status) => updateComplaint(
    complaintId,
    { status, ...(status === "Resolved" ? { remaining: "Resolved", overdue: false } : {}) },
    status === "Resolved" ? "Complaint marked resolved." : "Officer started work.",
  );
  const escalateComplaint = (complaint) => {
    const level = complaint.level?.startsWith("L1") ? "L2 - Zonal Officer"
      : complaint.level?.startsWith("L2") ? "L3 - Municipal Commissioner"
        : "L1 - Ward Officer";
    return updateComplaint(complaint.id, { status: "Escalated", level, overdue: true }, `Escalated to ${level}.`);
  };
  const saveDraft = async (f, draftId) => {
    try {
      const photos = await Promise.all(f.photos.map((photo) => photo.data || photoToDataUrl(photo.file)));
      const draft = {
        id: draftId || `DRAFT-${window.crypto?.randomUUID?.() || Date.now()}`,
        title: f.title.trim(),
        category: f.category,
        desc: f.desc,
        ok: f.ok,
        location: f.location,
        photos,
        updatedAt: new Date().toISOString(),
      };
      const items = [draft, ...draftData.items.filter((item) => item.id !== draft.id)];
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(items));
      setDraftData({ items, error: "" });
      setStorageError("");
      go("drafts");
      return true;
    } catch (error) {
      setStorageError(`Draft could not be saved. Check browser storage and photo permissions. ${error.message}`);
      return false;
    }
  };
  const deleteDraft = (draftId) => {
    try {
      const items = draftData.items.filter((draft) => draft.id !== draftId);
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(items));
      setDraftData({ items, error: "" });
      setStorageError("");
    } catch (error) {
      setStorageError(`Draft could not be deleted: ${error.message}`);
    }
  };

  const { page, id } = route;
  const shell = { page, go, theme, toggle };

  if (page === "landing") return <Landing go={go} theme={theme} toggle={toggle}
    auth={authData.auth} onAuth={signIn} onSignOut={signOut} notice={accessNotice} />;
  if (["overview", "assigned", "escalation"].includes(page))
    return (
      <OfficialShell {...shell} onSignOut={signOut}>
        {storageError && <div className="storage-alert" role="alert">{storageError}</div>}
        {page === "overview" && <Overview go={go} complaints={allComplaints} />}
        {page === "assigned" && <Assigned go={go} complaints={allComplaints} onUpdateStatus={updateStatus} />}
        {page === "escalation" && <Escalation go={go} complaints={allComplaints} onEscalate={escalateComplaint} />}
      </OfficialShell>
    );
  return (
    <CitizenShell {...shell} complaints={allComplaints} drafts={draftData.items} auth={authData.auth} onSignOut={signOut}>
      {storageError && <div className="storage-alert" role="alert">{storageError}</div>}
      {page === "report" && <Report go={go} onSubmit={submit} onSaveDraft={saveDraft}
        complaints={allComplaints} draft={draftData.items.find((draft) => draft.id === id)} />}
      {page === "success" && created && <Success c={created} go={go} />}
      {page === "mine" && <MyComplaints go={go} list={mine} />}
      {page === "drafts" && <Drafts list={draftData.items} onDelete={deleteDraft} go={go} />}
      {page === "detail" && <Detail id={id} go={go} complaints={allComplaints}
        onRefresh={refreshComplaints} onAddEvidence={addEvidence} />}
      {page === "public" && <PublicDashboard go={go} complaints={allComplaints} role={authData.auth?.role} />}
    </CitizenShell>
  );
}