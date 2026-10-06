import LegalPage from '../components/LegalPage';

const Shipping = () => (
    <LegalPage
        title="Shipping & Delivery"
        updated="September 2026"
        intro="Fast delivery across Nepal with real-time tracking in My Orders plus SMS updates."
        sections={[
            { h: '1. Delivery times', p: 'Kathmandu Valley: 24–48 hours.\nStandard shipping across Nepal: 3–5 business days. Remote areas may take 1–2 days longer.' },
            { h: '2. Fees', p: 'Delivery fee is shown at checkout before payment and depends on location and parcel size. Free-shipping campaigns are announced on the homepage.' },
            { h: '3. Cash on Delivery', p: 'COD is available across major cities. Please keep the exact amount ready and inspect your parcel on arrival.' },
            { h: '4. Tracking', p: 'Track status in real time from My Orders after login. You also receive SMS updates on dispatch and delivery.' },
            { h: '5. Delays & contact', p: 'Strikes, weather, or festivals can delay couriers. For help: support@shopynepal.com or WhatsApp +977 9845877777.' },
        ]}
    />
);

export default Shipping;
