import json, os
import logging
import pymysql
import datetime
import requests

from flask import request, Response, render_template, jsonify, Flask, send_from_directory, abort
from flask_cors import CORS

from bs4 import BeautifulSoup
from pywebpush import webpush, WebPushException
from dotenv import load_dotenv

import threading
import schedule
from time import sleep


# region Enviromaent Configuration
print("\n>>>> Getting Environments")
load_dotenv()
# region Database Connection
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_NAME = os.getenv("DB_NAME")
DB_SSL_CA = os.getenv("DB_SSL_CA")
DB_SSL_CERT = os.getenv("DB_SSL_CERT")
DB_SSL_KEY = os.getenv("DB_SSL_KEY")
DB_SSL_IS_ON = bool(os.getenv("DB_SSL_IS_ON") == "True")

if DB_SSL_IS_ON:
    dbConfig = {
        'host': DB_HOST,
        'user': DB_USER,
        'password': DB_PASS,
        'database': DB_NAME,
        'ssl_ca': DB_SSL_CA,
        'ssl_cert': DB_SSL_CERT,
        'ssl_key': DB_SSL_KEY,
    }
else:
    dbConfig = {
        'host': DB_HOST,
        'user': DB_USER,
        'password': DB_PASS,
        'database': DB_NAME,
    }


# endregion

# region Service Configuration
ORIGIN_DOMAIN = os.getenv("DOMAIN")
SERVICE_DOMAIN = os.getenv("SERVICE_DOMAIN")
CONTACT_EMAIL = os.getenv("CONTACT_EMAIL")
SCRAP_URL = os.getenv("SCRAP_URL")
# endregion

# VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
# VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")

# region Flask App Configuration
FLASK_APP_SECRET_KEY = os.getenv("FLASK_APP_SECRET_KEY")
APP_HOST_IP = os.getenv("APP_HOST_IP")
APP_PORT = int(os.getenv("APP_PORT"))
IS_DEBUG = bool(os.getenv("IS_DEBUG") == "True")

app = Flask(__name__)
app.config['SECRET_KEY'] = FLASK_APP_SECRET_KEY

CORS(app, resources={r"/*": {"origins": f".{ORIGIN_DOMAIN}"}})

# scheduler = APScheduler()
# endregion

# region Notification Settings
NOTIF_TIME_ZULU = os.getenv("NOTIF_TIME_ZULU")
print(NOTIF_TIME_ZULU)

NTF_TITLE_DEFAULT = os.getenv("NTF_TITLE_DEFAULT")
NTF_TITLE = os.getenv("NTF_TITLE")

NTF_ICON_DEFAULT = os.getenv("NTF_ICON_DEFAULT")
NTF_ICON = os.getenv("NTF_ICON")

NTF_BADGE_DEFAULT = os.getenv("NTF_BADGE_DEFAULT")
NTF_BADGE = os.getenv("NTF_BADGE")

NTF_SOUND_DEFAULT = os.getenv("NTF_SOUND_DEFAULT")
NTF_SOUND = os.getenv("NTF_SOUND")
# endregion

#region Vapid Keys Configuration
DER_BASE64_ENCODED_PRIVATE_KEY_FILE_PATH = os.path.join(os.getcwd(),"keys/private_key.txt")
DER_BASE64_ENCODED_PUBLIC_KEY_FILE_PATH = os.path.join(os.getcwd(),"keys/public_key.txt")

VAPID_PRIVATE_KEY = open(DER_BASE64_ENCODED_PRIVATE_KEY_FILE_PATH, "r+").readline().strip("\n")
VAPID_PUBLIC_KEY = open(DER_BASE64_ENCODED_PUBLIC_KEY_FILE_PATH, "r+").read().strip("\n")

VAPID_CLAIMS = {
"sub": f"mailto:{CONTACT_EMAIL}"
}
# endregion



print(">> Environments Loaded\n")
# endregion

todays_launch = {
    "date": "dd.mm.yyyy",
    "title": "dd Month yyyy -- Day",
    "items": [
        {"name": "Item 1", "calories": 0},
        {"name": "Item 2", "calories": 0},
        {"name": "Item 3", "calories": 0},
        {"name": "Item 4", "calories": 0}
    ]
}

   

# region Sub Funcs
def send_web_push(subscription_information, message):
    try:
        webpush(
            subscription_info=subscription_information,
            data=json.dumps(message),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        return True
    except Exception as e:
        print(">>>> Error/send_web_push\n",e)
        return False

def check_date_format(date_string):
    try:
        # Belirli bir tarih formatına uygun olup olmadığını kontrol etmek için datetime.strptime kullanıyoruz
        datetime.datetime.strptime(date_string, '%d.%m.%Y')
        return True
    except ValueError:
        return False

def is_weekday(date_string):
    # Belirtilen tarihi datetime nesnesine dönüştürme
    date_obj = datetime.strptime(date_string, '%d.%m.%Y')
    
    # Haftanın günlerine göre kontrol yapma (0: Pazartesi, 1: Salı, ..., 6: Pazar)
    if date_obj.weekday() < 5:  # 0-4 arası (Pazartesi-Cuma) hafta içi günlerini temsil eder
        return True
    else:
        return False
#endregion


# region DB Funcs

class DbConnection:
    
    cnx = None
    db_Config = None

    def __init__(self, dbConf):
        self.db_Config = dbConf
        self.connect()
    
    def check_connection(self):
        
        try:
            self.cnx.ping(reconnect=True)
            return True
        except Exception as e:
            print(">>>> Error/check_connection\n",e)
            return False

    def connect(self):
        try:
            self.cnx = pymysql.connect(**self.db_Config)
            print(">>>> DB Connection Established\n")
            return True
        except Exception as e:
            print(">>>> Error/DbConnection/connect\n",e)
            return False


db = DbConnection(dbConfig)


#region Subscriptions
def get_sub(userId):
    try:
        cnx = db.cnx
        cursor = cnx.cursor(pymysql.cursors.DictCursor)

        cursor.execute("SELECT * FROM NOTIFY_LIST WHERE NOTIF_UUID = %s;",(userId,))

        row = cursor.fetchone()
        resp = row if row != None else False

        cursor.close()
        return resp
    
    except Exception as e:
        print(">>>> Error/get_sub\n",e)
        return False
    
def add_sub(sub_token, confirm='0'):
    try:
        cnx = db.cnx
        cursor = cnx.cursor(pymysql.cursors.DictCursor)
        sub_token = json.dumps(sub_token)
        print("add sub=> ", sub_token)

        # cursor.execute("INSERT INTO NOTIFY_LIST (SUB_TOKEN, CONFIRM) VALUES (%s, %s);",(sub_token, confirm,))
        cursor.execute("CALL NOTIFY_INSERT(@V_ID, %s, %s);",(sub_token, confirm,))
        cursor.execute("SELECT @V_ID;")

        row = cursor.fetchone()

        print("add sub=> ", row)

        cnx.commit()

        cursor.close()
        return row["@V_ID"]
    
    except Exception as e:
        print(">>>> Error/add_sub\n",e)
        return False

def get_all_subs(limit=1000):
    try:
        cnx = db.cnx
        cursor = cnx.cursor(pymysql.cursors.DictCursor)

        cursor.execute("SELECT * FROM NOTIFY_LIST WHERE CONFIRM = '1' ORDER BY _ID DESC LIMIT %s",(limit,))

        row = cursor.fetchall()

        resp = row if len(row) > 0 else False

        cursor.close()
        return resp
    
    except Exception as e:
        print(">>>> Error/get_all_subs\n",e)
        return False
#Corfirmation
def update_sub(userId, confirm='1'):
    try:
        cnx = db.cnx
        cursor = cnx.cursor(pymysql.cursors.DictCursor)
        
        cursor.execute("UPDATE NOTIFY_LIST SET CONFIRM = %s WHERE NOTIF_UUID = %s;",(confirm,userId,))
        cnx.commit()

        cursor.close()
        return True

    except Exception as e:
        print(">>>> Error/update_sub\n",e)
        return False
    
def remove_sub(userId):
    try:
        cnx = db.cnx
        cursor = cnx.cursor(pymysql.cursors.DictCursor)

        cursor.execute("UPDATE NOTIFY_LIST SET STATUS = '0' WHERE NOTIF_UUID = %s;",(userId,))
        cnx.commit()

        cursor.close()
        return True
    
    except Exception as e:
        print(">>>> Error/remove_sub\n",e)
        return False
#endregion


#region Menu
def get_menu(date):
    try:
        if (check_date_format(date) == False):
            return False
        
        cnx = db.cnx
        cursor = cnx.cursor(pymysql.cursors.DictCursor)

        cursor.execute("SELECT * FROM `MENU` WHERE MENU_DATE = %s",(date,))

        row = cursor.fetchone()
        resp = False if row == None else True

        cursor.close()
        cnx.close()
        return resp


    except Exception as e:
        print(">>> Error/Get_Menu\n",e)
        return False

def show_menu(date):
    try:
        if (check_date_format(date) == False):
            return False
        
        cnx = db.cnx
        cursor = cnx.cursor(pymysql.cursors.DictCursor)

        cursor.execute("SELECT * FROM `MENU` WHERE MENU_DATE = %s",(date,))

        row = cursor.fetchone()
        if row == None:
            resp = False
        else:
            resp = {
                "date": row["MENU_DATE"],
                "title": row["MENU_TITLE"],
                "items": [
                    {"name": row["ITEM1_NAME"], "calories": int(row["ITEM1_CALORIES"])},
                    {"name": row["ITEM2_NAME"], "calories": int(row["ITEM2_CALORIES"])},
                    {"name": row["ITEM3_NAME"], "calories": int(row["ITEM3_CALORIES"])},
                    {"name": row["ITEM4_NAME"], "calories": int(row["ITEM4_CALORIES"])}
                ]
            }

        cursor.close()
        return resp


    except Exception as e:
        print(">>>> Error/Show_Menu\n",e)
        return False

def add_menu(menu):
    try:
        cnx = db.cnx
        cursor = cnx.cursor(pymysql.cursors.DictCursor)

        menu_date = menu["date"]
        menu_title = menu["title"]

        item1_name = item1_calories = item2_name = item2_calories = item3_name = item3_calories = item4_name = item4_calories = None

        if len(menu["items"]) >= 1:
            item1_name = menu["items"][0]["name"]
            item1_calories = menu["items"][0]["calories"]
        if len(menu["items"]) >= 2:
            item2_name = menu["items"][1]["name"]
            item2_calories = menu["items"][1]["calories"]
        if len(menu["items"]) >= 3:
            item3_name = menu["items"][2]["name"]
            item3_calories = menu["items"][2]["calories"]
        if len(menu["items"]) >= 4:
            item4_name = menu["items"][3]["name"]
            item4_calories = menu["items"][3]["calories"]

        cursor.execute(
            "INSERT INTO `MENU` (MENU_DATE, MENU_TITLE, ITEM1_NAME, ITEM1_CALORIES, ITEM2_NAME, ITEM2_CALORIES, ITEM3_NAME, ITEM3_CALORIES, ITEM4_NAME, ITEM4_CALORIES ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);"
            ,(menu_date, menu_title, item1_name , item1_calories , item2_name , item2_calories , item3_name , item3_calories , item4_name , item4_calories,)
        )

        cnx.commit()

        cursor.close()
        cnx.close()
        return True

    except Exception as e:
        print(">>>> Error/Add_Menu\n",e)
        return False
#endregion


#endregion

# region Other Funcs
def scrapMenu(): 
    print(">>>Scrap Task | Start")  
    try:
        req = requests.get(SCRAP_URL, verify=False)

        if req.status_code == 200:
            soup = BeautifulSoup(req.content, 'html.parser')
            article = soup.find("article", {"class":"ortaTum"})
            divs = article.find_all("div", {"class":"row"})
            # Today
            todayHead = divs[1].find_all("thead")[0]
            todayBody = divs[1].find_all("tbody")[0]    
            #region Date
            todayDateTitle = todayHead.find_all("span")[0].get_text()
            months = {
                "Ocak" : "01",
                "Şubat": "02",
                "Mart": "03",
                "Nisan": "04",
                "Mayıs": "05",
                "Haziran": "06",
                "Temmuz": "07",
                "Ağustos": "08",
                "Eylül": "09",
                "Ekim": "10",
                "Kasım": "11",
                "Aralık": "12",
            }
            thisDay = todayDateTitle.split(' ')[0]
            thisMonth = todayDateTitle.split(' ')[1]
            thisMonth = months[thisMonth]
            thisYear = todayDateTitle.split(' ')[2]
            date =  ".".join([thisDay, thisMonth, thisYear])
            #endregion
            #region items
            items = todayBody.find_all("td")
            itemList = []
            if (len(items) > 0):
                for i  in items:
                    line = i.get_text()
                    if len(line) >= 10:
                        try:
                            line=line.split(" ")
                            calories = line[-2][1:]
                            name = " ".join(line[:-2])
                            itemList.append({"name": name, "calories": calories})
                        except Exception as e:
                            print(">>>> Scrap Task | Skip Item\n",e)
            #endregion
            menu = {
                "date": f"{date}",
                "title": f"{todayDateTitle}",
                "items": itemList
            }

            if (get_menu(menu["date"]) != True):
                add_menu(menu)
                print(">>>Scrap Task | Ended | New Menu Created")
                return True
            
            print(">>>Scrap Task | Ended | No New Menu")
            return False

    except Exception as e:
        print(">>>> Scrap Task | Ended | \n",e)
        return False

def updateMenu():
    print(">>> Update Task | Start")
    global todays_launch
    today = datetime.datetime.now() + datetime.timedelta(hours=3) # UTC +3
    today = today.strftime("%d.%m.%Y")
    launch = show_menu(today)
    if launch:
        todays_launch = launch
        print(">>> Update Task | Menu Updated\n")
    print(">>> Update Task | Ended")

def pushAll():
    print(">>> Push Task | Start")
    updateMenu()
    allSubs = get_all_subs() 
    if (bool(allSubs)):
        for i in allSubs:
            send_web_push(json.loads(i["SUB_TOKEN"]), todays_launch)
    print(">>> Push Task | Ended")

def dbPing():
    if db.check_connection() == False:
        db.connect()

# endregion

# region Schedule
def my_job():
    schedule.every(30).minutes.do(dbPing)
    schedule.every().day.at("22:00").do(scrapMenu)
    schedule.every().day.at("22:10").do(updateMenu)
    schedule.every().day.at(NOTIF_TIME_ZULU).do(pushAll)
    # schedule.every().day.at("11:43").do(pushAll)

    while True:
        schedule.run_pending()
        sleep(10)
    

# endregion

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/worker/<filename>', methods=["GET"])
def worker(filename):
    if request.method == "GET" and filename == "sw.js":
        return send_from_directory('templates/worker', 'sw.js')
    return Response(status=404, mimetype="application/json")

@app.route('/i/<filename>', methods=["GET"])
def baruthane(filename):
    if request.method == "GET" and filename == "baruthane.png":
        return send_from_directory('templates/', 'baruthane.png')
    return abort(404)

@app.route("/subscription/", methods=["GET", "POST"])
def subscription():
    """
        POST creates a subscription
        GET returns vapid public key which clients uses to send around push notification
    """
    try:
        if request.method == "GET":
            return jsonify({"public_key": VAPID_PUBLIC_KEY})
        
        elif request.method == "POST":
            if not request.json or not request.json.get('sub_token') or not request.json.get('status'):
                return jsonify({"status":-1, "message": "Unexpected data" })
            
            token = request.json.get('sub_token')
            status = request.json.get('status')
            userId = request.json.get('userId')
            
            if (token != None and status != None):
            
                if status == "sub":
                    print(">>>> Subscription\n",userId, "\n token \n", token)
                    user = get_sub(userId)
                    if (bool(user)):
                        return jsonify({
                            "status":0, 
                            "message":"User Already Subscribed",
                            "userId": userId,
                        })

                    else:
                        uuid = add_sub(token)

                        if (bool(uuid)):
                            return jsonify({
                                "status":1, 
                                "message":"Subscription Successful",
                                "userId": uuid,
                            })
                        else:
                            return jsonify({
                                "status":-1, 
                                "message":"Subscription Failed"
                            })
                
                # UNSUB
                elif status == "unsub":
                    user = get_sub(userId)
                    if (bool(user)):
                        isRemoved = remove_sub(userId)

                        if (bool(isRemoved)):
                            return jsonify({
                                "status":1, 
                                "message":"Unsubscribed"
                            })
                        
                        else:
                            return jsonify({
                                "status":0, 
                                "message":"Unsubscription Failed"
                            })

                    else:
                        return jsonify({
                            "status":1, 
                            "message":"User Not Found"
                        })

                else:
                    return jsonify({"status":0, "message":"Unknown Status"})
            
    except Exception as e:
        print(">>>> Error/Subscription\n",e)
        return jsonify({"status":0, "message":"Unexpected Error"})

@app.route("/push_v1/",methods=['POST'])
def push_v1():
    message = { 
        "title" : "Bugün Ne Yiyeceğiz \nThis is a Test Message",
        "items" : []        
    }
    
    if not request.json or not request.json.get('userId') or not request.json.get('userId'):
        return jsonify({'failed':1})

    userId = request.json.get('userId')
    token = request.json.get('sub_token')

    user = get_sub(userId)
    if (bool(user)):
        update_sub(userId)

        try:
            if (type(token) == str):
                token = json.loads(token)
            elif (type(token) == dict):
                token = token      
            
            send_web_push(token, message)
            return jsonify({"status":1, "nessage":"Test Message Sended"})

        except Exception as e:
            print(">>>> Error/Push_v1\n" ,e)
            return jsonify({"status":0, "message":"Test Message Error Raised"})
    
    else:
        return jsonify({"status":0, "message":"User Not Found"})
        

    
@app.route("/api/menu", methods=["POST"])
def menu():
    if request.method == "POST":
        data = request.get_json()

        if ("sub_token" in data.keys() and "userId" in data.keys()):
            sub_token = data["sub_token"]
            userId = data["userId"]

            user = get_sub(userId)

            if ((bool(user)) and (json.loads(user["SUB_TOKEN"]) == sub_token) and (user["CONFIRM"] == "1")):
                if is_weekday:
                    global todays_launch
                    message = ""

                    for d in todays_launch["items"]:
                        message += f"{d['name']} ({d['calories']} kalori)\n"

                    menu = {
                        "title" : todays_launch["title"],
                        "body" : message,
                        "badge" : "images/badge.png",
                        "icon" : NTF_ICON,
                        "sound" : NTF_SOUND
                    }
                    menu = {
                        "status": 1,
                        "menu": menu
                    }
                    return jsonify(menu)
                
                return jsonify({
                    "status": 2,
                })

            # if is_weekday:
            #     global todays_launch
            #     message = ""

            #     for d in todays_launch["items"]:
            #         message += f"{d['name']} ({d['calories']} kalori)\n"

            #     menu = {
            #         "title" : todays_launch["title"],
            #         "body" : message,
            #         "badge" : "images/badge.png",
            #         "icon" : NTF_ICON,
            #         "sound" : NTF_SOUND
            #     }
            #     return jsonify(menu)
            return jsonify({
                "status": 0,
            })
    else:
        return Response(status=404, mimetype="application/json")
    








@app.route("/api/push", methods=["GET", "POST"])
def pushNotification():

    if request.method == "POST":
        if not request.json or not request.json.get('credential'):
            return abort(404)

        credential = request.json.get('push_credential')
        with open("./push_credential.txt", "r") as f:
            line = f.readline()
            if (line == credential):
                pushAll()
                return jsonify({"status":1, "message":"Notification Sent"})
            
    return abort(404)

@app.route("/api/scrap", methods=["GET", "POST"])
def scrap():
    if request.method == "POST":
        if not request.json or not request.json.get('scrap_credential'):
            return abort(404)

        credential = request.json.get('scrap_credential')
        with open("./scrap_credential.txt", "r") as f:
            line = f.readline()
            scrapMenu()

    return abort(404)

@app.route("/api/update", methods=["GET", "POST"])
def update():
    if request.method == "POST":
        if not request.json or not request.json.get('update_credential'):
            return abort(404)

        credential = request.json.get('update_credential')
        with open("./update_credential.txt", "r") as f:
            line = f.readline()
            updateMenu()


if __name__ == "__main__":
    print(">> Starting Server\n")

    job_thread = threading.Thread(target=my_job)
    job_thread.start()

    # app.run(host=APP_HOST_IP, port=APP_PORT, use_reloader=True, threaded=True, debug=True)
    app.run(host=APP_HOST_IP, port=APP_PORT, use_reloader=False, threaded=True, debug=IS_DEBUG)
