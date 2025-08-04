/* eslint-disable no-undef */
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { Star, ExternalLink, UserCheck, Truck, AlertCircle, ArrowLeft, Loader2, Search } from 'lucide-react';

// --- Configuration ---
// CORRECTED: This now points to your live server URL.
const API_BASE_URL = 'https://sports-card-deal-server.onrender.com'; 

// --- Firebase Configuration ---
let firebaseConfig = {};
try {
    if (process.env.REACT_APP_FIREBASE_CONFIG) {
        firebaseConfig = JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG);
    } else if (typeof __firebase_config !== 'undefined') {
        firebaseConfig = JSON.parse(__firebase_config);
    }
} catch (e) {
    console.error("Could not parse Firebase config:", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

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

const OpportunityCard = ({ item, onSelect }) => {
    const { cardName, grade, avgRawPrice, avgPsaPrice, potentialProfit, imageUrl } = item;
    return (
        <div onClick={() => onSelect(item)} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-lg flex flex-col group hover:border-indigo-500 cursor-pointer transition-all">
            <div className="relative">
                <img src={imageUrl} alt={cardName} className="w-full h-64 object-cover" onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/300x400/2d3748/ffffff?text=Image+Not+Found' }}/>
                <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">{grade}</div>
            </div>
            <div className="p-4 flex flex-col flex-grow">
                <h3 className="text-lg font-bold text-white mb-3 flex-grow">{cardName}</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center text-gray-400">
                        <span>Avg. Raw Cost:</span>
                        <span className="font-bold text-white">${avgRawPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-400">
                        <span>Avg. {grade} Price:</span>
                        <span className="font-bold text-white">${avgPsaPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg pt-2 border-t border-gray-700 text-green-400">
                        <span className="font-bold">Potential Profit:</span>
                        <span className="font-extrabold">${potentialProfit.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ListingCard = ({ item }) => {
    const { title, price, imageUrl, listingUrl, sellerRating, shippingPrice } = item;
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
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <ExternalLink className="w-5 h-5" />
                    </div>
                </div>
            </a>
            <div className="p-4 flex flex-col flex-grow">
                 <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="block hover:text-indigo-400 transition-colors">
                    <h3 className="text-sm font-bold text-white mb-2 flex-grow">{title}</h3>
                </a>
                <div className="mb-4 text-lg text-white font-bold">${price.toLocaleString()}</div>
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
            </div>
        </div>
    );
};

// --- Main App Component ---
export default function App() {
    const [view, setView] = useState('opportunities');
    const [selectedCard, setSelectedCard] = useState(null);
    const [opportunities, setOpportunities] = useState([]);
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [yearFilter, setYearFilter] = useState(currentYear - 1);
    const [sportFilter, setSportFilter] = useState('Baseball');

    // --- Fetch Grading Opportunities ---
    const fetchOpportunities = async () => {
        if (!yearFilter || !sportFilter) return;
        setLoading(true);
        setError(null);
        setView('opportunities');
        try {
            const url = new URL(`${API_BASE_URL}/api/grading-opportunities`);
            url.searchParams.append('year', yearFilter);
            url.searchParams.append('sport', sportFilter);
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setOpportunities(data);
        } catch (err) {
            setError('Failed to fetch grading opportunities. The server might be busy.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };
    
    // Fetch on initial load
    useEffect(() => {
        fetchOpportunities();
    }, []);

    // --- Fetch live listings when a card is selected ---
    const handleSelectCard = async (card) => {
        setSelectedCard(card);
        setView('listings');
        setLoading(true);
        setError(null);
        try {
            const url = new URL(`${API_BASE_URL}/api/raw-listings`);
            url.searchParams.append('cardName', card.cardName);
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setListings(data);
        } catch (err) {
            setError('Failed to fetch live listings.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        setView('opportunities');
        setSelectedCard(null);
        setListings([]);
    };

    const FilterSelect = ({ value, onChange, options, placeholder }) => (
        <div className="relative">
            <select value={value} onChange={onChange} className="w-full bg-gray-800 border-2 border-gray-700 rounded-full py-3 px-4 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all">
                {placeholder && <option value="">{placeholder}</option>}
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </div>
    );

    return (
        <div className="bg-gray-900 min-h-screen font-sans text-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-2">Sports Card <span className="text-indigo-400">Grading Opportunities</span></h1>
                    <p className="text-lg text-gray-400">Find raw cards with the highest potential profit after grading.</p>
                </header>

                <div className="mb-8 max-w-xl mx-auto space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FilterSelect value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} options={years} />
                        <FilterSelect value={sportFilter} onChange={(e) => setSportFilter(e.target.value)} options={sports} />
                        <button onClick={fetchOpportunities} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-full flex items-center justify-center transition-colors duration-300">
                            <Search className="w-5 h-5 mr-2" />
                            Find Opportunities
                        </button>
                    </div>
                </div>

                {view === 'listings' && (
                    <button onClick={handleBack} className="mb-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-full flex items-center">
                        <ArrowLeft className="w-5 h-5 mr-2" />
                        Back to Opportunities
                    </button>
                )}

                {loading && <div className="flex justify-center items-center py-20"><Loader2 className="w-12 h-12 animate-spin text-indigo-400" /></div>}
                {error && <div className="text-center col-span-full py-12 text-red-400 bg-red-900/20 p-4 rounded-lg flex items-center justify-center"><AlertCircle className="w-6 h-6 mr-3"/>{error}</div>}
                
                {!loading && !error && (
                    <div>
                        {view === 'opportunities' && (
                            <>
                                {opportunities.length === 0 && <div className="text-center col-span-full py-12"><p className="text-gray-400 text-lg">No profitable grading opportunities found. Try a different year or sport.</p></div>}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {opportunities.map(item => <OpportunityCard key={`${item.cardName}-${item.grade}`} item={item} onSelect={handleSelectCard} />)}
                                </div>
                            </>
                        )}
                        {view === 'listings' && selectedCard && (
                             <>
                                <h2 className="text-3xl font-bold text-white mb-2">Live Raw Listings for:</h2>
                                <p className="text-lg text-indigo-400 mb-6">{selectedCard.cardName}</p>
                                {listings.length === 0 && <div className="text-center col-span-full py-12"><p className="text-gray-400 text-lg">No active "Buy It Now" listings found for this card.</p></div>}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {listings.map(item => <ListingCard key={item.id} item={item} />)}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
