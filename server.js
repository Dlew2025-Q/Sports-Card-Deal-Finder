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
const GRADING_FEE = 30;
const EBAY_FEE_PERCENTAGE = 0.13;

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
        return data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    } catch (error) {
        console.error(`Error fetching completed items for "${keywords}":`, error);
        return [];
    }
};

// --- API Endpoints ---
app.get('/', (req, res) => {
    res.send('Grading Opportunity server is running!');
});

app.get('/api/grading-opportunities', async (req, res) => {
    console.log('Fetching grading opportunities...');
    try {
        const hotlistData = await fs.readFile(HOTLIST_PATH, 'utf8');
        const hotlist = JSON.parse(hotlistData);
        let opportunities = [];

        for (const card of hotlist) {
            for (const grade of card.grades) {
                const rawKeywords = `${card.name} -psa -bgs -sgc -cgc`;
                const gradedKeywords = `${card.name} ${grade}`;

                const [soldRaw, soldGraded] = await Promise.all([
                    fetchCompletedItems(rawKeywords),
                    fetchCompletedItems(gradedKeywords)
                ]);

                console.log(`For "${card.name} ${grade}": Found ${soldRaw.length} raw sales and ${soldGraded.length} graded sales.`);

                // ** THE FIX IS HERE **
                // Lowered the requirement to 1 sale each to work better with sandbox data.
                if (soldRaw.length < 1 || soldGraded.length < 1) {
                    continue;
                }

                const totalRawAcquisitionCost = soldRaw.reduce((acc, item) => {
                    const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
                    const shipping = parseFloat(item.shippingInfo[0].shippingServiceCost?.[0]?.__value__ || 0);
                    return acc + price + shipping;
                }, 0);
                const avgRawAcquisitionCost = totalRawAcquisitionCost / soldRaw.length;

                const totalGradedPrice = soldGraded.reduce((acc, item) => acc + parseFloat(item.sellingStatus[0].currentPrice[0].__value__), 0);
                const avgPsaPrice = totalGradedPrice / soldGraded.length;
                
                const ebayFees = avgPsaPrice * EBAY_FEE_PERCENTAGE;
                const potentialProfit = avgPsaPrice - avgRawAcquisitionCost - GRADING_FEE - ebayFees;

                if (potentialProfit > 0) {
                    opportunities.push({
                        cardName: card.name,
                        grade: grade,
                        avgRawPrice: avgRawAcquisitionCost,
                        avgPsaPrice: avgPsaPrice,
                        potentialProfit: potentialProfit,
                        imageUrl: soldGraded[0].galleryURL[0]
                    });
                }
            }
        }

        opportunities.sort((a, b) => b.potentialProfit - a.potentialProfit);
        res.json(opportunities);

    } catch (error) {
        console.error('Error fetching grading opportunities:', error);
        res.status(500).json({ error: 'Failed to fetch grading opportunities.' });
    }
});

app.get('/api/raw-listings', async (req, res) => {
    const { cardName } = req.query;
    if (!cardName) {
        return res.status(400).json({ error: 'Card name is required.' });
    }

    const keywords = `${cardName} -psa -bgs -sgc -cgc`;
    const url = `https://svcs.ebay.com/services/search/FindingService/v1?SECURITY-APPNAME=${EBAY_APP_ID}&OPERATION-NAME=findItemsByKeywords&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keywords)}&itemFilter(0).name=ListingType&itemFilter(0).value=FixedPrice`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const items = data?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];
        
        const listings = items.map(item => ({
            id: item.itemId[0],
            title: item.title[0],
            price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
            imageUrl: item.galleryURL[0],
            listingUrl: item.viewItemURL[0],
            sellerRating: parseInt(item.sellerInfo[0].feedbackScore[0]),
            shippingPrice: parseFloat(item.shippingInfo[0].shippingServiceCost?.[0]?.__value__ || 0),
        }));

        res.json(listings);
    } catch (error) {
        console.error('Error fetching raw listings:', error);
        res.status(500).json({ error: 'Failed to fetch raw listings.' });
    }
});


app.listen(PORT, () => {
    console.log(`SERVER VERSION 2.0 IS LIVE on port ${PORT}`);
});
