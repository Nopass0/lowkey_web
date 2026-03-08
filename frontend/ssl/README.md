Wildcard certificates from Let's Encrypt require DNS validation for a real domain.

Place issued files here after DNS-based issuance:
- `fullchain.pem`
- `privkey.pem`
- `chain.pem`

Current project state:
- frontend is configured for `http://localhost:3001`
- no public domain is configured in the app
- no DNS provider credentials are stored for automated ACME DNS challenges

To complete issuance, you need:
- a domain name you control, for example `example.com`
- access to create TXT records for `_acme-challenge.example.com`
- an ACME client with DNS automation, or manual DNS-01 validation
