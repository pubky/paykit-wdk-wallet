import json,sys,urllib.request
def rpc(m, p, url="http://127.0.0.1:18545"):
    r=urllib.request.urlopen(urllib.request.Request(url,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json"}))
    return json.load(r)
if __name__=="__main__":
    n=int(rpc("eth_blockNumber",[])["result"],16)
    for b in range(n-8,n+1):
        blk=rpc("eth_getBlockByNumber",[hex(b),False])["result"]
        for h in blk["transactions"]:
            rc=rpc("eth_getTransactionReceipt",[h])["result"]
            print(b,h,rc["status"],rc["gasUsed"],rc["from"],rc["to"],len(rc["logs"]))
