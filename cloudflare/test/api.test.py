import json, sys, urllib.request
B = sys.argv[1]
def call(method, path, body=None, token=None):
    req = urllib.request.Request(B + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'User-Agent': 'sixtysix-api-test', **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
s, b = call('POST', '/api/account/signup', {'username': 'apitest' + str(__import__('time').time_ns() % 100000), 'password': 'correct horse 66'})
tok = json.loads(b).get('token'); print('signup', s, b[:80])
tests = [('POST','/api/plot/buy',{}),('POST','/api/plot/collect',{}),('POST','/api/plot/sow',{'crop':'wheat'}),('POST','/api/plot/upgrade',{'building':'well'}),
 ('POST','/api/plot/expedition/start',{}),('POST','/api/plot/scroll',{}),('POST','/api/plot/glean',{}),('POST','/api/plot/stall/offer',{'item':'wheat','qty':1,'price':5}),
 ('POST','/api/city/move',{'lot':5}),('POST','/api/skills/learn',{'skill':'x'}),('POST','/api/skills/respec',{}),('POST','/api/looks/buy',{'look':'x'}),
 ('POST','/api/hunt/find',{'index':0}),('POST','/api/exodus/run',{'distance':100,'seconds':30}),('POST','/api/flags',{'questionId':'q1','reason':'typo'}),
 ('POST','/api/duels/challenge',{'username':'tester','stake':0}),('GET','/api/admin/flags/summary',None),
 ('POST','/api/account/username',{'username':'tester3b','password':'correct horse 66'}),
 ('POST','/api/account/password',{'current':'correct horse 66','password':'another horse 77'}),
 ('POST','/api/account/delete',{'confirm':'tester3b','password':'another horse 77'})]
bad = 0
for m, p, body in tests:
    s, b = call(m, p, body, tok)
    flag = '  <-- SERVER ERROR' if s >= 500 else ''
    bad += s >= 500
    print(f'{s} {m:4} {p:32} {b[:70]}{flag}')
print('server errors:', bad)
