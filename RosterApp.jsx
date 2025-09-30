import React, { useState, useEffect, useCallback } from 'react';
import { GlassWater, Send, Video, Camera, ShieldAlert, Users, Trash2, Plus, LogOut, LayoutDashboard, User } from 'lucide-react';

// --- FIREBASE IMPORTS AND SETUP ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, query, onSnapshot, updateDoc, getDocs, where, arrayUnion, arrayRemove } from 'firebase/firestore';

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firestore Path Constants
const TEAM_SETTINGS_DOC_PATH = `artifacts/${appId}/public/data/team_settings`;
const ADMIN_IDS_FIELD = 'admin_user_ids';
const PLAYERS_COLLECTION = `artifacts/${appId}/public/data/players`;
const HUB_DOC_ID = 'hub_data'; // Document holding team dashboard settings

// Mock data for initial seeding (roster)
const MOCK_PLAYERS = [
  { name: 'Alex Johnson', jerseyNumber: 23, headshotUrl: 'https://placehold.co/100x100/1e40af/ffffff?text=AJ', role: 'Captain' },
  { name: 'Maria Garcia', jerseyNumber: 11, headshotUrl: 'https://placehold.co/100x100/1d4ed8/ffffff?text=MG', role: 'Forward' },
  { name: 'Sam Chen', jerseyNumber: 88, headshotUrl: 'https://placehold.co/100x100/3b82f6/ffffff?text=SC', role: 'Defense' },
];

// Mock data for initial seeding (dashboard settings)
const INITIAL_HUB_DATA = {
    opponent: "The Go-Getters (Initial Seed)",
    dateTime: "Friday, October 4th at 7:00 PM",
    totalPlayers: 3,
    captains: 1,
    jerseyColor: "Emerald Green",
    coachsMessage: "Welcome to the unified Team Hub! This message is synced via the cloud. Go to the Roster tab to set your name and number.",
    timestamp: new Date().toISOString()
};


// --- UTILITY COMPONENTS ---

const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-8">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
  </div>
);

// --- MAIN APP COMPONENT ---
export default function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' or 'roster'
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [adminIds, setAdminIds] = useState([]); // List of Admin User IDs
  const [hubData, setHubData] = useState(INITIAL_HUB_DATA); // Dashboard data

  const isAdmin = adminIds.includes(userId);
  const settingsDocRef = db ? doc(db, TEAM_SETTINGS_DOC_PATH, HUB_DOC_ID) : null;


  // 1. FIREBASE INITIALIZATION AND AUTHENTICATION
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      onAuthStateChanged(firebaseAuth, async (user) => {
        if (!user) {
          if (initialAuthToken) {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } else {
            await signInAnonymously(firebaseAuth);
          }
        }
        setUserId(firebaseAuth.currentUser?.uid || 'anonymous');
        setIsAuthReady(true);
      });
    } catch (e) {
      console.error("Error initializing Firebase:", e);
      setIsAuthReady(true);
      setUserId('mock-user');
    }
  }, []);

  // 2. DATA FETCHING AND INITIAL SEEDING
  useEffect(() => {
    if (!db || !isAuthReady || !userId) return;

    const playersCollectionRef = collection(db, PLAYERS_COLLECTION);
    
    // A. Ensure Admin List and Seed Initial Data
    const ensureAdminAndSeed = async () => {
      try {
        // 1. Ensure the user has a profile, or create one
        const q = query(playersCollectionRef, where('userId', '==', userId));
        const userDocs = await getDocs(q);

        if (userDocs.empty) {
          const newPlayerRef = doc(playersCollectionRef);
          const newPlayer = {
            id: newPlayerRef.id,
            userId: userId,
            name: `New Recruit ${userId.substring(0, 4)}`, // Use name prompt
            jerseyNumber: 99,
            headshotUrl: `https://placehold.co/100x100/60a5fa/ffffff?text=${userId.substring(0, 2)}`,
            role: 'New Recruit',
          };
          await setDoc(newPlayerRef, newPlayer);

          // 2. Ensure initial hub data exists (including initial admin setup)
          const hubDocRef = doc(db, TEAM_SETTINGS_DOC_PATH, HUB_DOC_ID);
          const hubDoc = await getDocs(playersCollectionRef);
          if (hubDoc.empty) {
            await setDoc(hubDocRef, { ...INITIAL_HUB_DATA, [ADMIN_IDS_FIELD]: [userId] }); // Set first user as admin
            
            // 3. Seed mock players (optional, for demonstration)
             MOCK_PLAYERS.forEach(async (player, index) => {
                const mockPlayerId = `mock-${index}-${Math.random().toString(36).substring(2, 9)}`;
                await setDoc(doc(playersCollectionRef, mockPlayerId), { ...player, userId: mockPlayerId, id: mockPlayerId });
             });
          }
        }
      } catch (error) {
        console.error("Error ensuring user or seeding data:", error);
      }
    };

    ensureAdminAndSeed();

    // B. Real-time Roster Listener
    const unsubscribePlayers = onSnapshot(playersCollectionRef, (snapshot) => {
      const newPlayers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPlayers(newPlayers);
    }, (error) => {
      console.error("Error fetching players:", error);
    });
    
    // C. Real-time Admin List and Hub Data Listener
    const hubDocRef = doc(db, TEAM_SETTINGS_DOC_PATH, HUB_DOC_ID);
    const unsubscribeHub = onSnapshot(hubDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            setAdminIds(data[ADMIN_IDS_FIELD] || []);
            setHubData(data); // Update dashboard data
        } else {
            console.warn("Team settings document not found.");
            setAdminIds([]);
            setHubData(INITIAL_HUB_DATA);
        }
    }, (error) => {
        console.error("Error fetching admin list/hub data:", error);
    });

    return () => { 
        unsubscribePlayers();
        unsubscribeHub();
    };
  }, [db, isAuthReady, userId]);

  // Update logic for User Profile (Headshot, Name, and Jersey Number)
  const handleUpdateProfile = useCallback(async (updates) => {
    if (!db || !userId) return;
    try {
      // Find the current user's document ID
      const userDoc = players.find(p => p.userId === userId);
      if (userDoc) {
        const docRef = doc(db, PLAYERS_COLLECTION, userDoc.id);
        await updateDoc(docRef, updates);
      } else {
        console.warn("Current user document not found.");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
    }
  }, [db, userId, players]);


  // --- ADMIN MANAGEMENT LOGIC ---
  const handleAddAdmin = async (id) => {
    if (!settingsDocRef || !id) return;
    try {
        await updateDoc(settingsDocRef, { [ADMIN_IDS_FIELD]: arrayUnion(id) });
    } catch (error) {
        console.error("Error adding admin:", error);
    }
  };

  const handleRemoveAdmin = async (id) => {
    if (!settingsDocRef || !id) return;
    try {
        await updateDoc(settingsDocRef, { [ADMIN_IDS_FIELD]: arrayRemove(id) });
    } catch (error) {
        console.error("Error removing admin:", error);
    }
  };

  // --- DASHBOARD COMPONENTS (Moved from index.html) ---

    // Component for editing the coach's message
    const CoachMessageEditor = () => {
        const [messageInput, setMessageInput] = useState(hubData.coachsMessage || '');
        const [isUpdating, setIsUpdating] = useState(false);
        
        useEffect(() => {
            setMessageInput(hubData.coachsMessage || '');
        }, [hubData.coachsMessage]);

        const handleSaveMessage = async () => {
            const newMessage = messageInput.trim();
            if (newMessage.length === 0 || !settingsDocRef) return;

            setIsUpdating(true);
            try {
                await setDoc(settingsDocRef, { 
                    coachsMessage: newMessage,
                    timestamp: new Date().toISOString(),
                    lastEditor: userId
                }, { merge: true });
                console.log("Coach's message updated successfully.");
            } catch (error) {
                console.error("Error updating coach's message:", error);
            } finally {
                setIsUpdating(false);
            }
        };

        return (
            <div className="md:col-span-2 bg-yellow-50 p-6 rounded-xl shadow-md border-b-4 border-yellow-400">
                <h2 className="text-2xl font-bold text-yellow-800 mb-3 border-b border-yellow-200 pb-2 flex justify-between items-center">
                    Coach's Corner
                </h2>
                <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    className={`w-full p-3 rounded-lg border-2 text-gray-800 transition ${isAdmin ? 'border-yellow-400 focus:ring-yellow-500' : 'border-gray-200 bg-gray-50'}`}
                    rows="4"
                    readOnly={!isAdmin}
                />
                
                {isAdmin && (
                    <button
                        onClick={handleSaveMessage}
                        disabled={isUpdating || messageInput.trim() === hubData.coachsMessage}
                        className="mt-4 bg-yellow-600 text-white py-2 px-4 rounded-lg font-bold hover:bg-yellow-700 transition text-sm disabled:opacity-50"
                    >
                        {isUpdating ? 'Saving...' : 'Save Message'}
                    </button>
                )}
                {!isAdmin && (
                    <p className="mt-2 text-sm text-yellow-700 font-medium">Only Administrators can edit this message.</p>
                )}
            </div>
        );
    };


    const DashboardView = () => (
        <div className="max-w-4xl mx-auto p-4 sm:p-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white text-center mb-10">
                Team Hub Dashboard
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Card 1: Next Game (Dynamic) */}
                <div className="bg-indigo-50 p-6 rounded-xl shadow-lg border-b-4 border-indigo-400">
                    <h2 className="text-2xl font-bold text-indigo-800 mb-3">Next Matchup</h2>
                    <p className="text-gray-700 mb-2">
                        <span className="font-medium">Opponent:</span> <span className="font-bold text-indigo-700">{hubData.opponent}</span>
                    </p>
                    <p className="text-gray-700 mb-4">
                        <span className="font-medium">Date & Time:</span> <span className="font-bold text-indigo-700">{hubData.dateTime}</span>
                    </p>
                    <button className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition">
                        View Full Schedule (Future Feature)
                    </button>
                </div>

                {/* Card 2: Team Roster Snapshot */}
                <div className="bg-green-50 p-6 rounded-xl shadow-lg border-b-4 border-green-400">
                    <h2 className="text-2xl font-bold text-green-800 mb-3">Roster Snapshot</h2>
                    <ul className="text-gray-700 space-y-2">
                        <li className="flex justify-between">
                            <span className='font-medium'>Total Players:</span> 
                            <span className="font-bold text-green-600">{players.length}</span>
                        </li>
                        <li className="flex justify-between">
                            <span className='font-medium'>Admins:</span> 
                            <span className="font-bold text-green-600">{adminIds.length}</span>
                        </li>
                        <li className="flex justify-between">
                            <span className='font-medium'>Jersey Color:</span> 
                            <span className="font-bold text-green-600">{hubData.jerseyColor}</span>
                        </li>
                    </ul>
                    <button 
                        onClick={() => setCurrentView('roster')}
                        className="mt-4 w-full bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700 transition"
                    >
                        Go to Roster
                    </button>
                </div>

                {/* Card 3: Coach's Corner (Dynamic) */}
                <CoachMessageEditor />
            </div>

            {/* Back Office Panel (Only visible to Admins) */}
            {isAdmin && <AdminPanel />}
        </div>
    );

  // --- ROSTER COMPONENTS ---
    
  // Component for the admin panel
  const AdminPanel = () => {
    const [newAdminId, setNewAdminId] = useState('');
    
    return (
        <div className="mt-12 p-6 bg-red-900/40 border-2 border-red-500 rounded-xl shadow-2xl">
            <h2 className="text-2xl font-bold text-red-300 mb-4 flex items-center">
                <ShieldAlert className="w-6 h-6 mr-2" />
                Admin Console (Back Office)
            </h2>
            <p className="text-red-200 mb-4">
                You are currently an Administrator. You can manage which User IDs have admin access here.
            </p>
            
            <div className="mb-6">
                <h3 className="text-xl font-semibold text-white mb-2 flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Current Administrators
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {adminIds.map(id => (
                        <div key={id} className="flex justify-between items-center bg-gray-800 p-2 rounded-lg text-sm font-mono break-all">
                            <span className={id === userId ? "text-yellow-400 font-bold" : "text-gray-300"}>
                                {id} {id === userId && '(You)'}
                            </span>
                            {id !== userId && (
                                <button
                                    onClick={() => handleRemoveAdmin(id)}
                                    className="p-1 bg-red-600 hover:bg-red-700 rounded text-white transition disabled:opacity-50"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="pt-4 border-t border-red-800">
                <h3 className="text-xl font-semibold text-white mb-2">Add New Admin</h3>
                <div className="flex space-x-2">
                    <input
                        type="text"
                        placeholder="Paste User ID to promote"
                        value={newAdminId}
                        onChange={(e) => setNewAdminId(e.target.value)}
                        className="flex-grow p-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:ring-red-500 focus:border-red-500 placeholder-gray-500"
                    />
                    <button
                        onClick={() => { handleAddAdmin(newAdminId.trim()); setNewAdminId(''); }}
                        disabled={!newAdminId || adminIds.includes(newAdminId.trim())}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center"
                    >
                        <Plus className="w-4 h-4 mr-1" /> Add
                    </button>
                </div>
            </div>
        </div>
    );
  };


  // Component for displaying each player in the list
  const PlayerCard = ({ player }) => (
    <div className="flex items-center p-4 bg-white/10 rounded-xl shadow-lg transition duration-300 ease-in-out hover:bg-white/20">
      <div className="w-16 h-16 mr-4 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
        <img
          src={player.headshotUrl}
          alt={player.name}
          className="object-cover w-full h-full"
          onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/100x100/cccccc/000000?text=ERR'; }}
        />
      </div>
      <div className="flex-grow">
        <h3 className="text-lg font-semibold text-white truncate">{player.name}</h3>
        <p className="text-sm text-blue-300">
            #{player.jerseyNumber} - {player.role}
            {adminIds.includes(player.userId) && <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">ADMIN</span>}
        </p>
      </div>
      {/* The responsive water bottle icon */}
      <button
        onClick={() => { setSelectedPlayer(player); setIsDetailOpen(true); }}
        className="ml-4 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition duration-150 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={`View details for ${player.name}`}
      >
        <GlassWater className="w-6 h-6 sm:w-8 sm:h-8" />
      </button>
    </div>
  );

  // Component for the main roster list
  const RosterList = () => (
    <div className="p-4 sm:p-8 w-full max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
          Active Player Roster
        </h1>
        <button 
            onClick={() => auth && signOut(auth)}
            className="flex items-center text-sm font-semibold text-gray-400 hover:text-white transition"
            aria-label="Sign Out"
        >
            Sign Out <LogOut className="w-4 h-4 ml-1" />
        </button>
      </div>
      
      <p className="text-blue-300 mb-6 text-center">
        Your User ID (for Admin Access): <span className="font-mono bg-white/10 p-1 rounded text-sm break-all">{userId}</span>
      </p>

      {players.length === 0 ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {players.map(player => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      )}
    </div>
  );

  // Component for the player detail view
  const PlayerDetail = () => {
    const isCurrentUser = selectedPlayer.userId === userId;

    const [jerseyInput, setJerseyInput] = useState(selectedPlayer.jerseyNumber);
    const [nameInput, setNameInput] = useState(selectedPlayer.name);
    const [isUpdating, setIsUpdating] = useState(false);

    // Mock upload function (updates the URL only)
    const handlePhotoUpload = async () => {
      setIsUpdating(true);
      const newPhotoUrl = `https://placehold.co/100x100/${Math.floor(Math.random()*16777215).toString(16)}/ffffff?text=${selectedPlayer.name.substring(0, 2)}`;
      await handleUpdateProfile({ headshotUrl: newPhotoUrl });
      // Re-fetch the updated player data for the current view
      setSelectedPlayer(p => ({ ...p, headshotUrl: newPhotoUrl }));
      setIsUpdating(false);
    };

    const handleJerseyUpdate = async () => {
        const newJersey = parseInt(jerseyInput, 10);
        // FIX: Allows #0 and limits to 99
        if (newJersey >= 0 && newJersey < 100) {
            setIsUpdating(true);
            await handleUpdateProfile({ jerseyNumber: newJersey });
            setSelectedPlayer(p => ({ ...p, jerseyNumber: newJersey }));
            setIsUpdating(false);
        } else {
            console.warn("Invalid jersey number. Must be between 0 and 99.");
        }
    };
    
    const handleNameUpdate = async () => {
        const newName = nameInput.trim();
        if (newName.length > 1) {
            setIsUpdating(true);
            await handleUpdateProfile({ name: newName });
            setSelectedPlayer(p => ({ ...p, name: newName }));
            setIsUpdating(false);
        } else {
            console.warn("Name cannot be empty.");
        }
    };


    return (
      <div className="p-4 sm:p-8 w-full max-w-2xl mx-auto">
        <button
          onClick={() => setIsDetailOpen(false)}
          className="text-blue-300 hover:text-white mb-6 flex items-center transition"
        >
          &larr; Back to Roster
        </button>

        <div className="bg-white/10 p-6 sm:p-8 rounded-2xl shadow-2xl backdrop-blur-sm">
          <div className="flex flex-col items-center">
            {/* Player Headshot */}
            <div className="relative w-32 h-32 mb-4 bg-gray-700 rounded-full overflow-hidden border-4 border-blue-500 shadow-xl">
              <img
                src={selectedPlayer.headshotUrl}
                alt={selectedPlayer.name}
                className="object-cover w-full h-full"
                onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/128x128/cccccc/000000?text=ERR'; }}
              />
            </div>

            {/* Upload Photo Option (Only for current user) */}
            {isCurrentUser && (
              <button
                onClick={handlePhotoUpload}
                disabled={isUpdating}
                className="flex items-center bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-full transition duration-150 shadow-lg mb-6 disabled:opacity-50"
              >
                <Camera className="w-4 h-4 mr-2" />
                {isUpdating ? 'Uploading...' : 'Upload New Headshot (Mock)'}
              </button>
            )}

            <h2 className="text-3xl font-bold text-white">{selectedPlayer.name}</h2>
            <p className="text-xl text-blue-300 font-mono flex items-center mt-2">
                Jersey: #{selectedPlayer.jerseyNumber}
            </p>
            <p className="text-sm text-gray-400 mt-1">Role: {selectedPlayer.role}</p>
          </div>

          <div className="mt-8">
            <h3 className="text-xl font-semibold text-white mb-4 border-b border-white/20 pb-2">
              Communication Links
            </h3>
            <div className="flex justify-around space-x-4">
              <a
                href={`#dm-${selectedPlayer.userId}`}
                className="flex flex-col items-center p-4 bg-blue-700 hover:bg-blue-800 rounded-xl transition duration-150 w-full text-white shadow-md hover:shadow-lg"
              >
                <Send className="w-8 h-8 mb-2" />
                <span className="text-sm font-medium text-center">Direct Message</span>
              </a>
              <a
                href={`#video-${selectedPlayer.userId}`}
                className="flex flex-col items-center p-4 bg-red-600 hover:bg-red-700 rounded-xl transition duration-150 w-full text-white shadow-md hover:shadow-lg"
              >
                <Video className="w-8 h-8 mb-2" />
                <span className="text-sm font-medium text-center">Private Video Chat</span>
              </a>
            </div>
          </div>

          {/* User Self-Editor (Only for current user) */}
          {isCurrentUser && (
            <div className="mt-8 p-4 bg-white/10 rounded-xl">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <ShieldAlert className="w-5 h-5 mr-2 text-yellow-400" />
                Edit My Profile
              </h3>
              
              {/* Name Field */}
              <div className="flex space-x-3 items-end mb-4">
                <div className="flex-grow">
                  <label htmlFor="playerName" className="block text-sm font-medium text-gray-300 mb-1">
                    Display Name
                  </label>
                  <input
                    id="playerName"
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full p-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={handleNameUpdate}
                  disabled={isUpdating || nameInput.trim() === selectedPlayer.name || nameInput.trim() === ''}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition duration-150 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  Save Name
                </button>
              </div>

              {/* Jersey Number Field */}
              <div className="flex space-x-3 items-end">
                <div className="flex-grow">
                  <label htmlFor="jerseyNumber" className="block text-sm font-medium text-gray-300 mb-1">
                    Jersey Number (0-99)
                  </label>
                  <input
                    id="jerseyNumber"
                    type="number"
                    min="0"
                    max="99"
                    value={jerseyInput}
                    onChange={(e) => setJerseyInput(e.target.value)}
                    className="w-full p-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={handleJerseyUpdate}
                  disabled={isUpdating || parseInt(jerseyInput, 10) === selectedPlayer.jerseyNumber || jerseyInput === '' || parseInt(jerseyInput, 10) < 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition duration-150 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  Save #
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    );
  };

  // --- RENDER LOGIC ---
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <LoadingSpinner />
        <p className="ml-4">Loading application and authenticating user...</p>
      </div>
    );
  }

  // --- Main Layout ---
  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-0">
      <style jsx="true">{`
        .font-sans { font-family: 'Inter', sans-serif; }
      `}</style>
      <div className="max-w-7xl mx-auto pt-8 pb-16">

        {/* --- Global Navigation Bar --- */}
        {!isDetailOpen && (
            <div className="flex justify-center space-x-4 mb-8">
                <button
                    onClick={() => setCurrentView('dashboard')}
                    className={`flex items-center px-6 py-3 rounded-full font-bold transition ${currentView === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                    <LayoutDashboard className="w-5 h-5 mr-2" />
                    Dashboard
                </button>
                <button
                    onClick={() => setCurrentView('roster')}
                    className={`flex items-center px-6 py-3 rounded-full font-bold transition ${currentView === 'roster' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                    <User className="w-5 h-5 mr-2" />
                    Roster
                </button>
            </div>
        )}
        
        {/* --- View Rendering --- */}
        {isDetailOpen && selectedPlayer ? (
          <PlayerDetail />
        ) : currentView === 'roster' ? (
          <RosterList /> 
        ) : (
          <DashboardView />
        )}
      </div>
    </div>
  );
}
