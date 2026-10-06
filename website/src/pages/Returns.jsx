import LegalPage from '../components/LegalPage';

const Returns = () => (
    <LegalPage
        title="Return & Refund Policy"
        updated="September 2026"
        intro="Strict 48-hour return and exchange window from the date of delivery. After 48 hours requests cannot be processed."
        sections={[
            { h: '1. Eligibility', p: 'Items must be unused, with tags and original packaging. Perishable, personalized, and final-sale items are not returnable. Start a return from My Orders within 48 hours of delivery.' },
            { h: '2. How to return', p: 'Go to My Orders → request return → upload clear photos of the issue. Our team confirms within 24 hours and arranges pickup or drop-off.' },
            { h: '3. Refunds', p: 'COD orders: refund via bank transfer / wallet within 3–5 business days of quality check.\nPrepaid (eSewa / FonePay): refunded to the source wallet within 5–7 business days.' },
            { h: '4. Exchanges', p: 'Size / color exchanges follow the same 48-hour rule and depend on stock availability.' },
            { h: '5. Damaged or wrong item', p: 'Report within 48 hours with unboxing photos. We reship or refund in full — delivery fee included.' },
        ]}
    />
);

export default Returns;
