const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Configuration ---
const EBAY_APP_ID = 'DarrenLe-SportsCa-SBX-a63bb60a4-d55b26f0';
const HOTLIST_PATH = path.join(__dirname, 'hotlist.json');
const GEMINI_API_KEY = ''; // The environment will provide this

app.use(cors());
app.use(express.json());

// --- API Endpoints ---

/**
 * Gets the top deals by comparing live eBay "Buy It Now" prices 
 * to the average of recent eBay sales for the same item.
 */
app.get('/api/top-deals', async (req, res) => {
    const { minPrice, maxPrice } = req.query;

    try {
        const hotlistData = await fs.readFile(HOTLIST_PATH, 'utf8');
        const hotlist = JSON.parse(hotlistData);
        let allDeals = [];

        for (const card of hotlist) {
            for (const grade of card.grades) {
                const keywords = `${card.name} ${grade}`;
                
                // --- Step 1: Get recent completed sales to find the average sale price ---
                const completedItemsUrl = `https://svcs.ebay.com/services/search/FindingService/v1?SECURITY-APPNAME=${EBAY_APP_ID}&OPERATION-NAME=findCompletedItems&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keywords)}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&sortOrder=EndTimeSoonest`;
                
                const completedResponse = await fetch(completedItemsUrl);
                const completedData = await completedResponse.json();
                const soldItems = completedData?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

                if (soldItems.length < 3) { // Need at least 3 sales to get a reliable average
                    continue; // Skip if not enough sales data
                }

                const totalSoldPrice = soldItems.reduce((acc, item) => acc + parseFloat(item.sellingStatus[0].currentPrice[0].__value__), 0);
                const avgSalePrice = totalSoldPrice / soldItems.length;

                // --- Step 2: Find active "Buy It Now" listings for the same card ---
                let activeItemsUrl = `https://svcs.ebay.com/services/search/FindingService/v1?SECURITY-APPNAME=${EBAY_APP_ID}&OPERATION-NAME=findItemsByKeywords&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keywords)}&itemFilter(0).name=ListingType&itemFilter(0).value=FixedPrice`;
                
                let itemFilterIndex = 1;
                if (minPrice) {
                    activeItemsUrl += `&itemFilter(${itemFilterIndex}).name=MinPrice&itemFilter(${itemFilterIndex}).value=${minPrice}`;
                    itemFilterIndex++;
                }
                if (maxPrice) {
                    activeItemsUrl += `&itemFilter(${itemFilterIndex}).name=MaxPrice&itemFilter(${itemFilterIndex}).value=${maxPrice}`;
                    itemFilterIndex++;
                }

                const activeResponse = await fetch(activeItemsUrl);
                const activeData = await activeResponse.json();
                const activeItems = activeData?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];

                const deals = activeItems.map(item => {
                    const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
                    return {
                        id: item.itemId[0],
                        title: item.title[0],
                        grade: grade,
                        price: price,
                        avgSalePrice: avgSalePrice,
                        dealScore: (avgSalePrice - price) / avgSalePrice,
                        imageUrl: item.galleryURL[0],
                        listingUrl: item.viewItemURL[0],
                        sellerRating: parseInt(item.sellerInfo[0].feedbackScore[0]),
                        shippingPrice: parseFloat(item.shippingInfo[0].shippingServiceCost?.[0]?.__value__ || 0),
                        listingType: 'FixedPrice'
                    };
                }).filter(deal => deal.price < avgSalePrice);

                allDeals = [...allDeals, ...deals];
            }
        }

        // Sort all found deals by the best deal score
        allDeals.sort((a, b) => b.dealScore - a.dealScore);

        res.json(allDeals.slice(0, 50)); // Return the top 50 deals

    } catch (error) {
        console.error('Error fetching top deals:', error);
        res.status(500).json({ error: 'Failed to fetch top deals from eBay.' });
    }
});

// --- NEW: AI Listing Analysis Endpoint ---
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
