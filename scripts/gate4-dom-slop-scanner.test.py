import os
import re
import sys
from html.parser import HTMLParser

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_script = False
        self.in_style = False
        self.text_nodes = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.in_script = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.in_script = False

    def handle_data(self, data):
        if not self.in_script and not self.in_style:
            text = data.strip()
            if text:
                self.text_nodes.append(text)

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html_path = os.path.join(base_dir, 'index.html')
if not os.path.exists(html_path):
    print(f"Error: {html_path} does not exist")
    sys.exit(1)

with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

print("=== GEENORA & URBANA MARKETPLACE: GATE 4 DOM ZERO-SLOP & ROLE SEPARATION SCANNER ===")

extractor = TextExtractor()
extractor.feed(html_content)
visible_text = ' '.join(extractor.text_nodes)

# 1. Banned developer buzzwords in visible DOM
banned_buzzwords = [
    'edge worker', 'zero-mock', 'latency', 'http 200',
    'chaos suite', 'rfc 7807', 'payload', 'uuid',
    'crucial', 'delve', 'landscape', 'pivotal', 'tapestry',
    'testament', 'seamlessly', 'revolutionary'
]

buzzword_violations = []
for word in banned_buzzwords:
    pattern = rf'\b{re.escape(word)}\b'
    matches = re.findall(pattern, visible_text, re.IGNORECASE)
    if matches:
        buzzword_violations.append((word, len(matches)))

# 2. Check for Domain Role & Marketplace Terms
roles = ['المتاجر', 'تاجر', 'Geenora']
role_matches = {role: (role.lower() in html_content.lower()) for role in roles}

# 3. Check for Operator Action Labels
action_terms = ['طلب', 'الشراء', 'تسجيل']
action_matches = {term: (term.lower() in html_content.lower()) for term in action_terms}

# 4. Check for Contrast Styling Tokens
wcag_tokens = ['bg-', 'text-', 'border-']
wcag_matches = [token for token in wcag_tokens if token in html_content.lower()]

print("\n--- RESULTS ---")
print(f"1. Buzzword Violations: {len(buzzword_violations)}")
for w, count in buzzword_violations:
    print(f"   [!] Found '{w}' ({count} times)")

print(f"2. Domain Role Coverage: {sum(role_matches.values())}/{len(roles)} terms present")
for r, present in role_matches.items():
    print(f"   - {r}: {'YES' if present else 'NO'}")

print(f"3. Operator Action Triggers: {sum(action_matches.values())}/{len(action_matches)} terms present")
for a, present in action_matches.items():
    print(f"   - {a}: {'YES' if present else 'NO'}")

passed = True
if buzzword_violations:
    print("\nFAIL: Visible DOM contains developer jargon / slop!")
    passed = False

if sum(role_matches.values()) < 2:
    print("\nFAIL: Missing critical domain role terms!")
    passed = False

if passed:
    print("\nALL GATE 4 DOM ZERO-SLOP PROOFS VERIFIED WITH EXIT CODE 0.")
    sys.exit(0)
else:
    sys.exit(1)
