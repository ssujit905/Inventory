import LegalPage from '../components/LegalPage';

const Terms = () => (
    <LegalPage
        title="Terms of Service"
        updated="September 2026"
        intro="By shopping on Shopy Nepal you agree to these terms. We sell genuine products with Cash on Delivery across major cities in Nepal."
        sections={[
            { h: '1. Orders & pricing', p: 'Prices are in Nepali Rupees (Rs.) and include applicable taxes unless stated. We may cancel orders for pricing errors, suspected fraud, or stock unavailability — any prepaid amount is refunded in full.' },
            { h: '2. Payment', p: 'We accept COD, eSewa and FonePay. Prepaid orders are confirmed only after the gateway reports success. Failed payments create no order.' },
            { h: '3. Shopy Coins', p: '1 Shopy Coin = Rs. 1 discount on future purchases. Coins are earned by writing ratings/reviews for purchased products and cannot be exchanged for cash.' },
            { h: '4. Fair use', p: 'Abuse — fake orders, review manipulation, payment fraud — may lead to order cancellation or account suspension.' },
            { h: '5. Liability', p: 'Product images are illustrative; minor variation may occur. Our liability is limited to the value of the affected order.' },
            { h: '6. Contact', p: 'Questions about these terms: support@shopynepal.com, Kathmandu, Nepal. Available 7 days a week.' },
        ]}
    />
);

export default Terms;
