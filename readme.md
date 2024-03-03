# Documentation

* Follow the article:
* https://tech.raturi.in/webpush-notification-using-python-and-flask/

* Make SSL Folder for mysql certs 
* Make `.env` file 


## Creating Virtual Enviroment <br>
#### Unix <br>
`pip install virtualenv`<br>
`virtualenv -p python3 ./.venv` <br>
`source ./.venv/bin/activate`

#### Windows <br>
`pip install virtualenv`<br>
`virtualenv ./.venv`<br>
`cd ./.venv/Scripts/`<br>
`activate.bat`<br>
`cd ../..`

## Download Requirements <br>
`pip install -r req.txt`

## Create App Keys <br>
#### Unix <br>
`openssl ecparam -name prime256v1 -genkey -noout -out keys/vapid_private.pem`<br><br>
`openssl ec -in keys/vapid_private.pem -outform DER | tail -c +8 | head -c 32 | base64 | tr -d '=' | tr '/+' '_-' >> keys/private_key.txt`<br><br>
`openssl ec -in keys/vapid_private.pem -pubout -outform DER | tail -c 65 | base64 | tr -d '=' | tr '/+' '_-' >> keys/public_key.txt`<br><br>




