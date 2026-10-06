import LegalPage from '../components/LegalPage';

const Privacy = () => (
    <LegalPage
        title="Privacy Policy"
        updated="September 2026"
        intro="Shopy Nepal (Kathmandu, Nepal) collects only the data needed to process your orders and improve your shopping experience. Contact: support@shopynepal.com."
        sections={[
            { h: '1. Data we collect', p: 'Name, phone, delivery address, email, order history, and support messages. We also store anonymized page-view and search analytics to improve the store.' },
            { h: '2. How we use it', p: 'To confirm, deliver and support orders, process COD / eSewa / FonePay payments, prevent fraud, and send order SMS updates. We never sell your data.' },
            { h: '3. Payments', p: 'Card / wallet details are handled by eSewa and FonePay on their pages. We only receive the payment status, never your PIN or full credentials.' },
            { h: '4. Cookies & analytics', p: 'We use a session id and cached preferences (cart, recently viewed) in your browser. Page visits are logged in anonymized form. No third-party ad trackers.' },
            { h: '5. Data sharing', p: 'Shared only with delivery partners (name, phone, address) and payment gateways (amount, order id). Staff access is restricted by role.' },
            { h: '6. Retention & deletion', p: 'Order records are kept for accounting and warranty purposes. To request export or deletion of your account data, email support@shopynepal.com — we respond within 7 days.' },
        ]}
    />
);

export default Privacy;
