#!/usr/bin/env bash
BASE=http://localhost:3000/v1
TOKENB64=$(printf '%s' '{"wallet_address":"0xdemoflow3","provider":"google"}' | base64 | tr -d '\n')
LOGIN=$(curl -s -m8 -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"zklogin_token\":\"$TOKENB64\",\"provider\":\"google\"}")
echo "LOGIN: $LOGIN"
TOK=$(printf '%s' "$LOGIN" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
echo "--- balance start ---"
curl -s -m8 "$BASE/wallet/balance" -H "Authorization: Bearer $TOK"; echo
echo "--- fund dev 500 ---"
curl -s -m8 -X POST "$BASE/wallet/fund/dev" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"amount":500}'; echo
echo "--- add recipient ---"
REC=$(curl -s -m8 -X POST "$BASE/recipients" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"name":"Jane Doe","country":"NG","mobile_money_type":"bank","account_number":"0123456789"}')
echo "RECIPIENT: $REC"
RID=$(printf '%s' "$REC" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "--- send 100 to recipient ---"
curl -s -m8 -X POST "$BASE/send" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"amount\":100,\"recipient_id\":\"$RID\",\"corridor\":\"NG\"}"; echo
echo "--- balance after send ---"
curl -s -m8 "$BASE/wallet/balance" -H "Authorization: Bearer $TOK"; echo
echo "--- transactions ---"
curl -s -m8 "$BASE/transactions?page=1&limit=5" -H "Authorization: Bearer $TOK"; echo
