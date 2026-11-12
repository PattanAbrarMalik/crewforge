from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path
pdfmetrics.registerFont(TTFont('Body','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Bold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
out=Path('docs/CrewForge-design.pdf');out.parent.mkdir(exist_ok=True)
c=canvas.Canvas(str(out),pagesize=(595.28,841.89));c.setTitle('CrewForge - PS1 system design');c.setAuthor('CrewForge')
c.setFillColor(HexColor('#235d49'));c.rect(0,720,595.28,122,fill=1,stroke=0)
c.setFillColor(HexColor('#d7e5cd'));c.setFont('Bold',9);c.drawString(42,802,'HACK4HACK 2026  /  PS1  /  SYSTEM DESIGN')
c.setFillColor(HexColor('#ffffff'));c.setFont('Bold',28);c.drawString(42,758,'CrewForge')
c.setFont('Body',10);c.drawString(42,737,'Team formation that stays correct when everyone joins at once.')
style=ParagraphStyle('body',fontName='Body',fontSize=9.3,leading=14,textColor=HexColor('#46574d'))
y=695
sections=[
('01  Invariants before interfaces','One person belongs to one team per event. Event rules bound team size; a new team stays forming until the minimum is met, while the maximum is a hard limit. Only the current leader approves requests, removes members, rotates invites, or changes recruiting status.'),
('02  One atomic consistency boundary','React and Vinext run on a Cloudflare Worker with D1/SQLite. The membership primary key enforces one team per event. A BEFORE INSERT trigger rejects a full team. AFTER triggers maintain counts, promote the oldest remaining member with a stable ID tie-break, and delete empty teams. Authorization guards, changes, idempotency receipts, and audit rows commit together in one D1 batch; any failed condition rolls back all of them.'),
('03  Retries and recovery','A receipt binds actor + idempotency key to the request fingerprint and original response. Changed payloads using the same key conflict. If a process dies after commit but before acknowledgement, retrying the original key returns the original result without a second membership or audit entry. Authorization is rechecked within the transaction.'),
('04  Identity and abuse controls','Production trusts the hosting gateway\'s immutable signed-in user ID. Sandbox personas are isolated under a hash of their owner. Strict schemas, bounded JSON bodies, same-origin writes, prepared SQL and persistent rate limits protect the API. Invite codes have 128 random bits, expiry and rotation. The invite table stores digests; leader-only retry receipts retain the original code response.'),
('05  Reads, live updates and matching','Indexed cursor pagination and FTS5 token-prefix search keep board reads bounded. Identical overlapping reads share only an in-flight query; there is no timed response cache. SSE sends durable audit revision invalidations every 1.5 seconds and clients refetch authorized views. Suggestions explain 70 points for missing skill coverage and 30 for circular timezone proximity.'),
('06  Evidence and explicit limits','Integration tests exercise 50 last-seat contenders, conflicting writes, lifecycle rules, permissions, expiry and retries against real workerd + SQLite. Load tests use 10,000 users, 2,000 teams and 100 connections. A SIGKILL test restarts persistent SQLite after an unacknowledged commit. Raw reports accompany the source. Local latency excludes public network and Vinext routing; local recovery does not prove provider-wide outage tolerance. D1\'s single writer is a throughput tradeoff; the match score is a transparent heuristic, not a recruiting prediction.'),
]
for title,body in sections:
 c.setFont('Bold',10);c.setFillColor(HexColor('#235d49'));c.drawString(42,y,title);y-=8
 p=Paragraph(body,style);w,h=p.wrap(511,900);y-=h;p.drawOn(c,42,y);y-=23
assert y>45,y
c.setStrokeColor(HexColor('#dfe6d8'));c.line(42,45,553,45)
c.setFont('Body',8);c.setFillColor(HexColor('#71806a'));c.drawString(42,28,'CrewForge | Design and tradeoffs | Submission companion');c.drawRightString(553,28,'1 / 1')
c.save();print(out)
