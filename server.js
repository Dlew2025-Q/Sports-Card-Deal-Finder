const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Configuration ---
const EBAY_APP_ID = 'DarrenLe-SportsCa-PRD-d3c53308d-d7814f5e'; 
const HOTLIST_PATH = path.join(__dirname, 'hotlist.json');

// --- CORS Configuration ---
const corsOptions = {
  origin: 'https://sports-card-deal-finder.onrender.com',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// --- Helper: Fetch Completed eBay Items ---
const fetchCompletedItems = async (keywords) => {
    const url = `https://svcs.ebay.com/services/search/FindingService/v1?SECURITY-APPNAME=${EBAY_APP_ID}&OPERATION-NAME=findCompletedItems&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keywords)}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&sortOrder=EndTimeSoonest`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];
    } catch (error) {
        console.error(`Error fetching completed items for "${keywords}":`, error);
        return [];
    }
};

// --- API Endpoints ---
app.get('/', (req, res) => {
    res.send('Card Deal Finder server is running!');
});

app.get('/api/top-deals', async (req, res) => {
    console.log('Fetching top deals from hotlist...');
    try {
        const hotlistData = await fs.readFile(HOTLIST_PATH, 'utf8');
        const hotlist = JSON.parse(hotlistData);
        let allDeals = [];

        for (const card of hotlist) {
            for (const grade of card.grades) {
                const keywords = `${card.name} ${grade}`;

                // Step 1: Get recent sales to find the average sale price
                const soldItems = await fetchCompletedItems(keywords);

                if (soldItems.length < 1) {
                    console.log(`No recent sales found for "${keywords}", skipping.`);
                    continue;
                }

                const totalSoldPrice = soldItems.reduce((acc, item) => acc + parseFloat(item.sellingStatus[0].currentPrice[0].__value__), 0);
                const avgSalePrice = totalSoldPrice / soldItems.length;

                // Step 2: Find active "Buy It Now" listings for the same card
                const activeItemsUrl = `https://svcs.ebay.com/services/search/FindingService/v1?SECURITY-APPNAME=${EBAY_APP_ID}&OPERATION-NAME=findItemsByKeywords&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keywords)}&itemFilter(0).name=ListingType&itemFilter(0).value=FixedPrice`;
                
                const activeResponse = await fetch(activeItemsUrl);
                const activeData = await activeResponse.json();
                const activeItems = activeData?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];

                const deals = activeItems
                    .map(item => {
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
                        };
                    })
                    .filter(deal => deal.price < avgSalePrice); // Only include listings priced below the average

                allDeals = [...allDeals, ...deals];
            }
        }

        allDeals.sort((a, b) => b.dealScore - a.dealScore);
        res.json(allDeals);

    } catch (error) {
        console.error('Error fetching top deals:', error);
        res.status(500).json({ error: 'Failed to fetch top deals.' });
    }
});

app.listen(PORT, () => {
    console.log(`SERVER VERSION 5.0 (FINAL) IS LIVE on port ${PORT}`);
});
