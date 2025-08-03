/* eslint-disable no-undef */
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { Search, Tag, Star, TrendingUp, TrendingDown, Flame, DollarSign, ExternalLink, Activity, UserCheck, Truck, AlertCircle, BrainCircuit } from 'lucide-react';

// --- Configuration ---
// This now points to the correct server URL you provided.
const API_BASE_URL = 'https://sports-card-deal-server.onrender.com'; 

// --- Firebase Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

// --- Initialize Firebase ---
let app;
let auth;
let db;
if (firebaseConfig.apiKey) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) {
        console.error("Error initializing Firebase:", e);
    }
}

// --- Helper Components ---
const DealScore = ({ price, avgSalePrice }) => {
    if (!avgSalePrice || avgSalePrice === 0) return null;
    const difference = avgSalePrice - price;
    const percentage = (difference / avgSalePrice) * 100;

    const getDealInfo = () => {
        if (percentage > 15) return { text: 'Excellent Deal', color: 'bg-green-500', icon: <Flame className="w-4 h-4 mr-1" /> };
        if (percentage > 5) return { text: 'Good Deal', color: 'bg-emerald-500', icon: <TrendingDown className="w-4 h-4 mr-1" /> };
        return { text: 'Fair Price', color: 'bg-gray-500', icon: <Tag className="w-4 h-4 mr-1" /> };
    };

    const { text, color, icon } = getDealInfo();

    return (
        <div className={`absolute top-2 right-2 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center shadow-lg ${color}`}>
            {icon}
            {text}
        </div>
    );
};

const Card = ({ item, isTracked, onTrack, onAnalyze }) => {
    const { id, title, grade, price, avgSalePrice, imageUrl, listingUrl, sellerRating, shippingPrice, analysis, isAnalyzing } = item;

    const getRatingColor = (rating) => {
        if (rating > 10000) return 'text-green-400';
        if (rating > 1000) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-lg flex flex-col group">
             <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="block">
                <div className="relative">
                    <img src={imageUrl} alt={title} className="w-full h-64 object-cover transform group-hover:scale-105 transition-transform duration-300" 
                         onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/300x400/2d3748/ffffff?text=Image+Not+Found' }}/>
                    <DealScore price={price} avgSalePrice={avgSalePrice} />
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <ExternalLink className="w-5 h-5" />
                    </div>
                </div>
            </a>
            <div className="p-4 flex flex-col flex-grow">
                 <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="block hover:text-indigo-400 transition-colors">
                    <h3 className="text-lg font-bold text-white mb-2 flex-grow">{title}</h3>
                </a>
                <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-semibold bg-blue-500 text-white px-3 py-1 rounded-full">{grade || 'N/A'}</span>
                </div>
                <div className="mb-4 space-y-1">
                    <div className="flex justify-between text-lg">
                        <span className="text-gray-400">eBay Price:</span>
                        <span className="text-white font-bold">${price.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-lg">
                        <span className="text-green-400">Avg. Sale Price:</span>
                        <span className="text-green-400 font-bold">{avgSalePrice > 0 ? `$${avgSalePrice.toFixed(2)}` : 'N/A'}</span>
                    </div>
                </div>
                {analysis && (
                    <div className={`my-2 p-3 rounded-lg text-sm ${analysis.includes('No obvious issues') ? 'bg-gray-700/50 text-gray-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                        <p className="font-bold mb-1">AI Analysis:</p>
                        <p className="italic">{analysis}</p>
                    </div>
                )}
                <div className="border-t border-gray-700 pt-3 mt-auto space-y-2 text-sm">
                    <div className="flex justify-between items-center text-gray-400">
                        <span className="flex items-center"><UserCheck className="w-4 h-4 mr-2 text-indigo-400"/>Seller Rating:</span>
                        <span className={`font-bold ${getRatingColor(sellerRating)}`}>{sellerRating.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-400">
                        <span className="flex items-center"><Truck className="w-4 h-4 mr-2 text-indigo-400"/>Shipping:</span>
                        <span className="font-bold text-white">{shippingPrice > 0 ? `$${shippingPrice.toFixed(2)}` : 'Free Shipping'}</span>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                        onClick={() => onAnalyze(item)}
                        disabled={isAnalyzing}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center transition-colors duration-300 disabled:bg-blue-800 disabled:cursor-not-allowed"
                    >
                        <BrainCircuit className="w-5 h-5 mr-2" />
                        {isAnalyzing ? 'Analyzing...' : 'Analyze Listing'}
                    </button>
                    <button
                        onClick={() => onTrack(item)}
                        className={`w-full font-bold py-2 px-4 rounded-lg flex items-center justify-center transition-colors duration-300 ${
                            isTracked
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                    >
                        <Star className="w-5 h-5 mr-2" />
                        {isTracked ? 'Untrack' : 'Track'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Main App Component ---
export default function App() {
    const [minBudget, setMinBudget] = useState('');
    const [maxBudget, setMaxBudget] = useState('');
    const [topDeals, setTopDeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [trackedCards, setTrackedCards] = useState([]);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // --- Firebase Authentication ---
    useEffect(() => {
        if (!auth) return;
        const signInUser = async () => {
            try {
                const authToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                if (authToken) await signInWithCustomToken(auth, authToken);
                else await signInAnonymously(auth);
            } catch (error) { console.error("Authentication failed:", error); }
        };
        signInUser();
        const unsubscribeAuth = onAuthStateChanged(auth, user => {
            setUserId(user ? user.uid : null);
            setIsAuthReady(true);
        });
        return () => unsubscribeAuth();
    }, []);

    // --- Firestore Data Fetching ---
    useEffect(() => {
        if (!isAuthReady || !userId || !db) return;
        const trackedRef = collection(db, 'artifacts', appId, 'users', userId, 'trackedCards');
        const unsubscribeFirestore = onSnapshot(trackedRef, (snapshot) => {
            setTrackedCards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Firestore snapshot error:", error));
        return () => unsubscribeFirestore();
    }, [isAuthReady, userId]);

    // --- Fetch Top Deals ---
    const fetchDeals = async () => {
        setLoading(true);
        setError(null);
        try {
            const url = new URL(`${API_BASE_URL}/api/top-deals`);
            if (minBudget) url.searchParams.append('minPrice', minBudget);
            if (maxBudget) url.searchParams.append('maxPrice', maxBudget);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            setTopDeals(data.map(deal => ({...deal, isAnalyzing: false, analysis: null})));
        } catch (err) {
            setError('Failed to fetch top deals. The server might be busy.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeals();
    }, []);


    // --- Event Handlers ---
    const handleTrackCard = async (card) => {
        if (!userId || !db) return;
        const trackedRef = doc(db, 'artifacts', appId, 'users', userId, 'trackedCards', card.id);
        const isTracked = trackedCards.some(c => c.id === card.id);
        try {
            if (isTracked) await deleteDoc(trackedRef);
            else await setDoc(trackedRef, card);
        } catch (error) { console.error("Error updating tracked card:", error); }
    };
    const isCardTracked = (cardId) => trackedCards.some(c => c.id === cardId);

    const handleAnalyze = async (cardToAnalyze) => {
        setTopDeals(prev => prev.map(c => c.id === cardToAnalyze.id ? { ...c, isAnalyzing: true } : c));
        try {
            const response = await fetch(`${API_BASE_URL}/api/listing-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: cardToAnalyze.title })
            });
            if (!response.ok) throw new Error('Analysis request failed');
            const data = await response.json();
            setTopDeals(prev => prev.map(c => c.id === cardToAnalyze.id ? { ...c, analysis: data.analysis, isAnalyzing: false } : c));
        } catch (err) {
            console.error("Analysis Error:", err);
            setTopDeals(prev => prev.map(c => c.id === cardToAnalyze.id ? { ...c, analysis: "Error generating analysis.", isAnalyzing: false } : c));
        }
    };

    return (
        <div className="bg-gray-900 min-h-screen font-sans text-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-2">Sports Card <span className="text-indigo-400">Deal Finder</span></h1>
                    <p className="text-lg text-gray-400">Today's top deals, based on live eBay prices vs. recent sales.</p>
                </header>

                 <div className="mb-8 max-w-xl mx-auto space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative">
                             <input type="number" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} placeholder="Min Budget ($)" className="w-full bg-gray-800 border-2 border-gray-700 rounded-full py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" />
                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                        </div>
                         <div className="relative">
                             <input type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} placeholder="Max Budget ($)" className="w-full bg-gray-800 border-2 border-gray-700 rounded-full py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" />
                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                        </div>
                        <button onClick={fetchDeals} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-full flex items-center justify-center transition-colors duration-300">
                            <Search className="w-5 h-5 mr-2" />
                            Find Deals
                        </button>
                    </div>
                </div>

                {trackedCards.length > 0 && (
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center"><Star className="w-6 h-6 mr-3 text-yellow-400"/>Your Tracked Deals</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {trackedCards.map(item => <Card key={item.id} item={item} isTracked={true} onTrack={handleTrackCard} onAnalyze={handleAnalyze} />)}
                        </div>
                         <hr className="my-8 border-gray-700" />
                    </div>
                )}

                <div>
                    <h2 className="text-3xl font-bold text-white mb-6">Top Deals Today</h2>
                    {loading && <div className="text-center col-span-full py-12 text-gray-400 text-lg">Finding the best deals...</div>}
                    {error && <div className="text-center col-span-full py-12 text-red-400 bg-red-900/20 p-4 rounded-lg flex items-center justify-center"><AlertCircle className="w-6 h-6 mr-3"/>{error}</div>}
                    {!loading && !error && topDeals.length === 0 && <div className="text-center col-span-full py-12"><p className="text-gray-400 text-lg">No deals found. Try adjusting your budget or expanding your hotlist.</p></div>}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {!loading && !error && topDeals.map(item => <Card key={item.id} item={item} isTracked={isCardTracked(item.id)} onTrack={handleTrackCard} onAnalyze={handleAnalyze} />)}
                    </div>
                </div>

                <footer className="text-center mt-12 text-gray-500 text-sm">
                    <p>This is a functional prototype. In a real-world application:</p>
                    <ol className="list-decimal list-inside inline-block text-left mt-2">
                        <li>The server would run a job to find deals automatically.</li>
                        <li>The hotlist of cards to track would be managed in a database.</li>
                        <li>User data is saved securely using Firebase Authentication and Firestore.</li>
                    </ol>
                    <p className="mt-4">User ID: <span className="font-mono bg-gray-800 px-1 rounded">{isAuthReady ? userId : 'Initializing...'}</span></p>
                </footer>
            </div>
        </div>
    );
}
