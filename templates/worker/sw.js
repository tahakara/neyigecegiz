'use strict';

/* eslint-disable max-len */

// const applicationServerPublicKey = "";

/* eslint-enable max-len */

function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

self.addEventListener('push', function(event) {
    console.log('[Service Worker][Push] Push Received.');
    console.log(`[Service Worker][Push] Push had this data: "${event.data}"`);
    console.log("[My Service Worker][Push] Event data => ", event.data);
    var data = JSON.parse(event.data.text());

    var message = "";

    data.items.forEach(item => {
        message += `${item.name} (${item.calories} kalori)\n`;
    });

    console.log("[My Service Worker][Push] data => ", data)
    const title = `${data.title}`;
    const options = {
        body: `${message}`,
        icon: `https://test.tahakara.dev/i/baruthane.png`,
        badge: `images/badge.png`,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker][Notification On Click] Notification click Received.');

    event.notification.close();

    event.waitUntil(
        clients.openWindow('https://developers.google.com/web/')
    );
});

self.addEventListener('pushsubscriptionchange', function(event) {
    console.log('[Service Worker][PushSubscriptionChange]: \'pushsubscriptionchange\' event fired.');
    const applicationServerPublicKey = localStorage.getItem('applicationServerPublicKey');
    const applicationServerKey = urlB64ToUint8Array(applicationServerPublicKey);
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        })
        .then(function(newSubscription) {
            // TODO: Send to application server
            console.log('[Service Worker][PushSubscriptionChange] New subscription: ', newSubscription);
        })
    );
});


function getTokenFromIndexedDB(id) {
    // IndexedDB veritabanına bağlanma
	// id 0 = sub_token
	// id 1 = userId 
	var request = indexedDB.open('Alpha', 1);
    var db;

    return new Promise((resolve, reject) => {
        request.onerror = function(event) {
            console.log("[My Services Worker][getTokenFromIndexedDB] IndexedDB bağlantı hatası:", event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onsuccess = function(event) {
            // Veritabanı bağlantısı başarıyla sağlandığında çalışacak kısım
            db = event.target.result;

            // Transaction başlatma
            var transaction = db.transaction(['tokens'], 'readonly');

            // Transaction objesi alınması
            var objectStore = transaction.objectStore('tokens');

            // Belirli bir anahtarı kullanarak girdiyi getirme
            var requestGet = objectStore.get(id); // Buradaki 1 getirmek istediğiniz anahtarın numarası

            requestGet.onsuccess = function(event) {
				if (id == 1) {
                	if (event.target.result) {
                	    // Giriş bulundu, sub_token'i çözme ve resolve etme
                	    resolve(JSON.parse(event.target.result.sub_token));
                	} else {
                	    // Giriş bulunamadı, null döndürme
                	    resolve(null);
                	}
				}
				else if (id == 2) {
					if (event.target.result) {
                	    // Giriş bulundu, sub_token'i çözme ve resolve etme
                	    resolve(event.target.result.userId);
                	} else {
                	    // Giriş bulunamadı, null döndürme
                	    resolve(null);
                	}
				}

            };

            requestGet.onerror = function(event) {
                console.log('[My Services Worker][getTokenFromIndexedDB] Satır getirilirken hata oluştu:', event.target.error);
                reject(event.target.error);
            };

            // Transaction'ı tamamlama
            transaction.oncomplete = function() {
                db.close();
            };
        };
    });
}

function getMenu() {
	var sub_token;
	var userId;
    getTokenFromIndexedDB(1).then(subToken => {
        console.log('[My Services Worker][Get Menu] Sub token:', subToken);
		getTokenFromIndexedDB(2).then(userId => {
			console.log('[My Services Worker][Get Menu] User Id:', userId);
        	if (subToken != null) {
        	    var sub_token = subToken
        	    fetch('/api/menu', {
        	            method: 'POST',
        	            headers: {
        	                'Content-Type': 'application/json'
        	            },
        	            body: JSON.stringify({
        	                sub_token: sub_token,
							userId : userId
        	            })
        	        })
        	        .then(response => {
        	            if (!response.ok) {
        	                throw new Error('Network response was not ok');
        	            }
        	            return response.json();
        	        })
        	        .then(response => {
        	            console.log("Menu Response=> ", response.menu);

						if (response.status == 1) {
							sendNotif(response.menu);
						} else if (response.status == 2) {
							console.log("[My Services Worker] No New Menu")
						} else if (response.status == 0){
							console.log("[My Services Worker] Not Authenticated")
						} else {
							console.log("[My Services Worker] Error")
						}
        	        })
        	        .catch(error => {
        	            console.error('[My Services Worker] Error:', error);
        	        });
        	} else {
        	    console.log("[My Services Worker][Get Menu] Not This Time")
        	}
		}).catch(error => {
			console.error('[My Services Worker][Get Menu] Hata:', error);
		});

    }).catch(error => {
        console.error('[My Services Worker][Get Menu] Hata:', error);
    });
}




function sendNotif(params) {
    self.registration.showNotification(params.title, {
        body: params.body,
        // icon: params.icon,
        badge: params.badge,
        sound: params.sound
    });
}

function getfood() {
    getTokenFromIndexedDB().then(subToken => {
        if (subToken != null) {
            fetch("https://idari.ahievran.edu.tr/sksdb/yemek/yemek-listesi/tr/118")
                .then(response => {
                    console.log("[My Services Worker][Get Food] ",response)
                })
        }

    }).catch(error => {
        console.error('Hata:', error);
    });
}
// setInterval(getfood, 10 * 1000);



// 10 dakikada bir "Merhaba" bildirimi gönderme işlevi
// setInterval(getMenu, 5 * 1000); // 10 dakika olarak ayarlandı