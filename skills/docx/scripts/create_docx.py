import json, os, sys, zipfile
from xml.sax.saxutils import escape

payload = json.load(sys.stdin) if not sys.stdin.isatty() else {}
title = str(payload.get('title', 'Leo document'))
paragraphs = payload.get('paragraphs', [])
if not isinstance(paragraphs, list): paragraphs = []
out = os.path.join(os.getcwd(), 'outputs'); os.makedirs(out, exist_ok=True)
body = f'<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{escape(title)}</w:t></w:r></w:p>'
for value in paragraphs:
    body += f'<w:p><w:r><w:t>{escape(str(value))}</w:t></w:r></w:p>'
document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}<w:sectPr/></w:body></w:document>'
content = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
with zipfile.ZipFile(os.path.join(out, 'document.docx'), 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('[Content_Types].xml', content)
    archive.writestr('_rels/.rels', rels)
    archive.writestr('word/document.xml', document)
print(json.dumps({'file': 'document.docx'}))
