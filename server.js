const express = require('express');
const fetch = require('node-fetch');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Configuration ---
const EBAY_APP_ID = 'DarrenLe-SportsCa-SBX-a63bb60a4-d55b26f0';
const HOTLIST_PATH = path.join(__dirname, 'hotlist.json');
const PRICES_DB_PATH = path.join(__dirname, 'psa_prices.json');
const GEMINI_API_KEY = ''; // The environment will provide this

// --- CORS Configuration ---
const corsOptions = {
  origin: 'https://sports-card-deal-finder.onrender.com', // Your deployed front-end URL
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.json());

// --- Helper Functions ---

const scrapePsaValue = async (cardName, grade) => {
    const psaUrl = `https://www.psacard.com/priceguide/search?q=${encodeURIComponent(cardName)}`;
    try {
        const { data } = await axios.get(psaUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        let psaValue = null;
        $('table.price-guide-table tbody tr').each((i, elem) => {
            const rowGrade = $(elem).find('td').eq(0).text().trim();
            if (rowGrade === grade) {
                const priceText = $(elem).find('td').eq(1).text().trim();
                psaValue = parseFloat(priceText.replace(/[$,]/g, ''));
                return false;
            }
        });
        return psaValue;
    } catch (error) {
        console.error(`Error scraping for ${cardName} (${grade}):`, error.message);
        return null;
    }
};

// --- API Endpoints ---

app.post('/api/run-scrape-job', async (req, res) => {
    console.log('Starting PSA price and sales velocity scraping job...');
    try {
        const hotlistData = await fs.readFile(HOTLIST_PATH, 'utf8');
        const hotlist = JSON.parse(hotlistData);
        let pricesDb = {};
        
        try {
            const existingData = await fs.readFile(PRICES_DB_PATH, 'utf8');
            pricesDb = JSON.parse(existingData);
        } catch (e) {
            console.log("Price database not found, creating a new one.");
        }

        for (const card of hotlist) {
            for (const grade of card.grades) {
                const key = `${card.name} | ${grade}`;
                console.log(`Analyzing: ${key}`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit

                const psaValue = await scrapePsaValue(card.name, grade);
                if (!psaValue) continue;

                const keywords = `${card.name} ${grade}`;
                const ebayUrl = `https://svcs.ebay.com/services/search/FindingService/v1?SECURITY-APPNAME=${EBAY_APP_ID}&OPERATION-NAME=findCompletedItems&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keywords)}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&sortOrder=EndTimeSoonest`;
                const ebayResponse = await fetch(ebayUrl);
                const ebayData = await ebayResponse.json();
                const items = ebayData?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
                const salesHistory = items.slice(0, 10).map(item => ({
                    date: item.sellingStatus[0].endTime[0].split('T')[0],
                    price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__)
                }));

                let saleProbability = "Slow";
                if (salesHistory.length >= 3) {
                    const prompt = `You are a sports card investment analyst. Classify the market velocity of a card based on its recent sales history. Respond with only a single word: "Quick", "Medium", or "Slow". "Quick" means multiple sales per week. "Medium" means about one sale per week. "Slow" means less than one sale per week. Card: ${card.name}, Grade: ${grade}, Recent Sales: ${salesHistory.length} sales in the last few weeks. Classification:`;
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
                    const geminiResponse = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                    });
                    if (geminiResponse.ok) {
                        const geminiResult = await geminiResponse.json();
                        const analysis = geminiResult.candidates[0].content.parts[0].text.trim();
                        if (["Quick", "Medium", "Slow"].includes(analysis)) {
                            saleProbability = analysis;
                        }
                    }
                }
                
                pricesDb[key] = {
                    price: psaValue,
                    saleProbability: saleProbability,
                    lastUpdated: new Date().toISOString()
                };
            }
        }
        await fs.writeFile(PRICES_DB_PATH, JSON.stringify(pricesDb, null, 2));
        console.log('PSA price scraping job completed successfully.');
        res.status(200).json({ message: 'Scraping job completed.', data: pricesDb });
    } catch (error) {
        console.error('Error running scrape job:', error);
        res.status(500).json({ error: 'Failed to run scraping job.' });
    }
});

app.get('/api/top-deals', async (req, res) => {
    const { minPrice, maxPrice } = req.query;
    let pricesDb;
    try {
        const pricesData = await fs.readFile(PRICES_DB_PATH, 'utf8');
        pricesDb = JSON.parse(pricesData);
    } catch (error) {
        // ** THE FIX IS HERE **
        // If the file doesn't exist, return an empty array instead of crashing.
        console.log('psa_prices.json not found. Run the scrape job to create it.');
        return res.json([]);
    }

    try {
        let allDeals = [];
        for (const key in pricesDb) {
            const [cardName, grade] = key.split(' | ');
            const { price: psaValue, saleProbability } = pricesDb[key];
            const keywords = `${cardName} ${grade}`;
            let itemFilterIndex = 0;
            let url = `https://svcs.ebay.com/services/search/FindingService/v1?SECURITY-APPNAME=${EBAY_APP_ID}&OPERATION-NAME=findItemsByKeywords&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keywords)}&itemFilter(${itemFilterIndex}).name=ListingType&itemFilter(${itemFilterIndex}).value=FixedPrice`;
            itemFilterIndex++;
            if (minPrice) {
                url += `&itemFilter(${itemFilterIndex}).name=MinPrice&itemFilter(${itemFilterIndex}).value=${minPrice}&itemFilter(${itemFilterIndex}).paramName=Currency&itemFilter(${itemFilterIndex}).paramValue=USD`;
                itemFilterIndex++;
            }
            if (maxPrice) {
                url += `&itemFilter(${itemFilterIndex}).name=MaxPrice&itemFilter(${itemFilterIndex}).value=${maxPrice}&itemFilter(${itemFilterIndex}).paramName=Currency&itemFilter(${itemFilterIndex}).paramValue=USD`;
                itemFilterIndex++;
            }
            const ebayResponse = await fetch(url);
            const data = await ebayResponse.json();
            const items = data?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];
            const deals = items.map(item => ({
                id: item.itemId[0],
                title: item.title[0],
                grade: grade,
                price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
                psaValue: psaValue,
                dealScore: (psaValue - parseFloat(item.sellingStatus[0].currentPrice[0].__value__)) / psaValue,
                imageUrl: item.galleryURL[0],
                listingUrl: item.viewItemURL[0],
                sellerRating: parseInt(item.sellerInfo[0].feedbackScore[0]),
                shippingPrice: parseFloat(item.shippingInfo[0].shippingServiceCost?.[0]?.__value__ || 0),
                listingType: 'FixedPrice',
                saleProbability: saleProbability
            }));
            allDeals = [...allDeals, ...deals];
        }
        allDeals.sort((a, b) => b.dealScore - a.dealScore);
        res.json(allDeals.slice(0, 50));
    } catch (error) {
        console.error('Error fetching top deals:', error);
        res.status(500).json({ error: 'Failed to fetch top deals.' });
    }
});

app.post('/api/listing-analysis', async (req, res) => {
    const { title } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'Listing title is required.' });
    }

    try {
        const prompt = `You are a sports card expert. Analyze the following eBay listing title for any potential red flags that might explain a low price. Check for terms like "cracked slab", "qualifier", "(OC)", "off-center", "miscut", "scratches", "chipped", or any other words that suggest a defect. If you find any, list them. If not, respond with "No obvious issues found in title.".

        Title: "${title}"

        Analysis:`;
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!geminiResponse.ok) {
            throw new Error('Gemini API request failed');
        }

        const geminiResult = await geminiResponse.json();
        const analysis = geminiResult.candidates[0].content.parts[0].text;
        
        res.json({ analysis });

    } catch (error) {
        console.error('AI Analysis Error:', error);
        res.status(500).json({ error: 'Failed to generate AI analysis.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
