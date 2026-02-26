import requests
import json


def main():
        
    url = "https://aip.baidubce.com/oauth/2.0/token?client_id=OiZdMdm79snhOVZB5T0RqYM9&client_secret=irkvJkutChSdt5JupEH8bXzseclK8ZBj&grant_type=client_credentials"
    
    payload = json.dumps("", ensure_ascii=False)
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    
    response = requests.request("POST", url, headers=headers, data=payload.encode("utf-8"))
    
    response.encoding = "utf-8"
    print(response.text)
    

if __name__ == '__main__':
    main()
