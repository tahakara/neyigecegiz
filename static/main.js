"use strict";

// const applicationServerPublicKey = "";
const pushButton = document.querySelector(".js-push-btn");

let isSubscribed = false;
let swRegistration = null;

function urlB64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function updateBtn() {
    if (Notification.permission === "denied") {
        pushButton.textContent = "Push Messaging Blocked.";
        pushButton.disabled = true;
        updateSubscriptionOnServer(null, 0);
        return;
    }

    if (isSubscribed) {
        pushButton.textContent = "Disable Push Messaging";
    } else {
        pushButton.textContent = "Enable Push Messaging";
    }

    pushButton.disabled = false;
}


// ------------------- Region P1 -------------------

function createIndexedDB() {
    // IndexedDB veritabanına bağlanma
    var request = indexedDB.open("Alpha", 1);
    var db;

    request.onerror = function(event) {
        console.log("IndexedDB bağlantı hatası:", event.target.errorCode);
    };

    request.onupgradeneeded = function(event) {
        db = event.target.result;
        var objectStore = db.createObjectStore("tokens", {
            keyPath: "id",
            autoIncrement: true,
        });
        objectStore.createIndex("token", "token", {
            unique: false
        });
    };

    request.onsuccess = function(event) {
        // Veritabanı bağlantısı başarıyla sağlandığında çalışacak kısım
        db = event.target.result;
        db.close(); // Veritabanı bağlantısını kapatma
    };
}

function addToIndexedDB(tokenObject, id) {
    // IndexedDB veritabanına bağlanma
    var request = indexedDB.open("Alpha", 1);
    var db;

    request.onerror = function(event) {
        console.log("IndexedDB bağlantı hatası:", event.target.errorCode);
    };

    request.onsuccess = function(event) {
        // Veritabanı bağlantısı başarıyla sağlandığında çalışacak kısım
        db = event.target.result;

        // Transaction başlatma
        var transaction = db.transaction(["tokens"], "readwrite");

        // Transaction objesi alınması
        var objectStore = transaction.objectStore("tokens");

        // Var olan bir anahtarın kontrol edilmesi
        var getRequest = objectStore.get(id);

        getRequest.onsuccess = function(event) {
            var existingEntry = event.target.result;
            // sub_token
            if (id == 1) {
                if (existingEntry) {
                    // Var olan giriş bulundu, güncelleme yapılıyor
                    existingEntry.sub_token = JSON.stringify(tokenObject);
                    objectStore.put(existingEntry);
                    console.log("[Main][SubToken] Mevcut giriş güncellendi:", tokenObject);
                } else {
                    // Var olan bir giriş bulunamadı, yeni giriş ekleniyor
                    objectStore.add({
                        id: id,
                        sub_token: JSON.stringify(tokenObject)
                    });
                    console.log("[Main][SubToken] Yeni giriş eklendi:", tokenObject);
                }
            }
            // userId
            else if (id == 2) {
                if (existingEntry) {
                    // Var olan giriş bulundu, güncelleme yapılıyor
                    existingEntry.sub_token = tokenObject;
                    objectStore.put(existingEntry);
                    console.log("[Main][UserID] Mevcut giriş güncellendi:", tokenObject);
                } else {
                    // Var olan bir giriş bulunamadı, yeni giriş ekleniyor
                    objectStore.add({
                        id: id,
                        userId: tokenObject
                    });
                    console.log("[Main][UserID] Yeni giriş eklendi:", tokenObject);
                }
            }
        };

        // Transaction'ı tamamlama
        transaction.oncomplete = function() {
            db.close();
        };
    };
}

function deleteUserInfo() {
    localStorage.clear();
    createIndexedDB();

    console.log("[Main] User Info Deleted");
}

function clearIndexedDB() {
    // IndexedDB veritabanına bağlanma
    var request = indexedDB.open("Alpha", 1);
    var db;

    request.onerror = function(event) {
        console.log("IndexedDB bağlantı hatası:", event.target.errorCode);
    };

    request.onsuccess = function(event) {
        // Veritabanı bağlantısı başarıyla sağlandığında çalışacak kısım
        db = event.target.result;

        // Transaction başlatma
        var transaction = db.transaction(["tokens"], "readwrite");

        // Transaction objesi alınması
        var objectStore = transaction.objectStore("tokens");

        // Tüm verileri silme
        var requestClear = objectStore.clear();

        requestClear.onsuccess = function(event) {
            console.log("Tablonun içeriği başarıyla silindi");
        };

        requestClear.onerror = function(event) {
            console.log(
                "Tablonun içeriği silinirken hata oluştu:",
                event.target.error
            );
        };

        // Transaction'ı tamamlama
        transaction.oncomplete = function() {
            db.close();
        };
    };
}
// ------------------- End Region P1 -------------------



function updateSubscriptionOnServer(subscription, subStatus, userId=null) {
    const subscriptionJson = document.querySelector(".js-subscription-json");
    const subscriptionDetails = document.querySelector(".js-subscription-details");

    return new Promise(function(resolve, reject) {
        if (subscription) {
            switch (subStatus) {
                case "sub":
                    $.ajax({
                        type: "POST",
                        url: "/subscription/",
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",
                        data: JSON.stringify({
                            sub_token: subscription,
                            status: subStatus,
                            userId: userId
                        }),
                        success: function(data) {
                            if (data.status == 1) {
                                subscriptionJson.textContent = JSON.stringify(subscription);
                                subscriptionDetails.classList.remove("is-invisible");
                                localStorage.setItem("userId", data.userId);
                                console.log("[Main] Subscription/Sub/Status(1) Success=>", data);
                                resolve(true); // AJAX isteği başarılı oldu
                            } else {
                                subscriptionJson.textContent = JSON.stringify(subscription);
                                subscriptionDetails.classList.remove("is-invisible");
                                console.log("[Main] Subscription/Sub/Status(0) Error=>", data);
                                resolve(false); // AJAX isteği başarısız oldu
                            }
                        },
                        error: function(err) {
                            console.log("[Main] Subscription Error =>", err);
                            reject(err); // AJAX isteği hatayla sonuçlandı
                        }
                    });
                    break;

                case "unsub":
                    $.ajax({
                        type: "POST",
                        url: "/subscription/",
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",
                        data: JSON.stringify({
                            sub_token: subscription,
                            status: subStatus,
                            userId: userId
                        }),
                        success: function(data) {
                            if (data.status == 1) {
                                subscriptionJson.textContent = JSON.stringify(subscription);
                                subscriptionDetails.classList.add("is-invisible");
                                deleteUserInfo();
                                if (data.message == "Unsubscribed") {
                                    console.log("[Main] Subscription/Unsub/Status(1) Success=>", data);
                                    esolve(true);
                                } else if (data.message == "User Not Found") {
                                    console.log("[Main] Subscription/Unsub/Status(1) Not Found=>", data);
                                    esolve(false);
                                } else {
                                    console.log("[Main] Subscription/Unsub/Status(1) Error=>", data);
                                    esolve(false);
                                }
                                resolve(true); // AJAX isteği başarılı oldu
                            } else {
                                subscriptionJson.textContent = JSON.stringify(subscription);
                                subscriptionDetails.classList.add("is-invisible");
                                deleteUserInfo();
                                console.log("[Main] Subscription/Unsub/Status(0) Error=>", data);
                                resolve(false); // AJAX isteği başarısız oldu
                            }
                        },
                        error: function(err) {
                            console.log("[Main] Subscription/Unsub Error =>", err);
                            reject(err); // AJAX isteği hatayla sonuçlandı
                        }
                    });
                    break;

                default:
                    break;
            }
        }
    });

    // if (subscription) {
    //     switch (subStatus) {
    //         case "sub":
    //             $.ajax({
    //                 type: "POST",
    //                 url: "/subscription/",
    //                 contentType: "application/json; charset=utf-8",
    //                 dataType: "json",
                    
    //                 data: JSON.stringify({
    //                     subscription: subscription,
    //                     status: subStatus,
    //                     userId: userId
    //                 }),

    //                 success: function(data) {
    //                     if (data.status == 1) {
    //                         // Subscription was successful
    //                         subscriptionJson.textContent = JSON.stringify(subscription);
    //     		            subscriptionDetails.classList.remove("is-invisible");
                            
    //                         localStorage.setItem("userId", data.userId);

    //                         console.log("[Main] Subscription/Sub/Status(1) Success=>", data);
                        
    //                     } else if(data.status == 0) {
    //                         // Already Subscribed
    //                         subscriptionJson.textContent = JSON.stringify(subscription);
    //     		            subscriptionDetails.classList.remove("is-invisible");
    //                         console.log("[Main] Subscription/Sub/Status(0) Error=>", data);

    //                     } else {
    //                         deleteUserInfo();
    //                         console.log("[Main] Subscription/Sub/Status(null) Error=>", data);
    //                     }
    //                 },
    //                 error: function(err) {
    //                     console.log("[Main] Subscription Error =>", err);
    //                 }
    //             });
    //             break;
        
    //         case "unsub":
    //             $.ajax({
    //                 type: "POST",
    //                 url: "/subscription/",
    //                 contentType: "application/json; charset=utf-8",
    //                 dataType: "json",
                    
    //                 data: JSON.stringify({
    //                     subscription: subscription,
    //                     status: subStatus,
    //                     userId: userId
    //                 }),

    //                 success: function(data) {

    //                     if (data.status == 1) {
    //                         // Subscription Deleted Successfully 
    //                         subscriptionJson.textContent = JSON.stringify(subscription);
    //                         subscriptionDetails.classList.add("is-invisible");
    //                         deleteUserInfo();
    //                         if (data.message == "Unsubscribed") {
    //                             console.log("[Main] Subscription/Unsub/Status(1) Success=>", data);
                            
    //                         } else if (data.message == "User Not Found") {
    //                             console.log("[Main] Subscription/Unsub/Status(1) Not Found=>", data);
                            
    //                         } else {
    //                             console.log("[Main] Subscription/Unsub/Status(1) Error=>", data);
    //                         }

    //                     } else if(data.status == 0) {
    //                         // Subscription Not Deleted
    //                         subscriptionJson.textContent = JSON.stringify(subscription);
    //                         subscriptionDetails.classList.add("is-invisible");
    //                         deleteUserInfo();
    //                         console.log("[Main] Subscription/Unsub/Status(0) Error=>", data);
                        
    //                     }  else {
    //                         subscriptionJson.textContent = JSON.stringify(subscription);
    //                         subscriptionDetails.classList.add("is-invisible");
    //                         deleteUserInfo();
    //                         console.log("[Main] Subscription/Unsub/Status(null) Error =>", data);
    //                     }
    //                 },

    //                 error: function(err) {
    //                         console.log("[Main] Subscription/Unsub Error =>", err);
    //                 }
    //             });    

    //             break;
            
    //         default:
    //             break;
    //     }
    // }
}

function subscribeUser() {
    const applicationServerPublicKey = localStorage.getItem("applicationServerPublicKey");
    const applicationServerKey = urlB64ToUint8Array(applicationServerPublicKey);
    swRegistration.pushManager
        .subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey,
        })
        .then(function(subscription) {

            var isSub = updateSubscriptionOnServer(subscription, "sub");
            
            isSub.then(
                result => {
                    if (result) {
                        addToIndexedDB(subscription, 1);
                        localStorage.setItem("sub_token", JSON.stringify(subscription));
                        
                        var userId = localStorage.getItem("userId");
                        addToIndexedDB(userId, 2);
                        isSubscribed = true;

                        updateBtn();
                        console.log("[Main] SubscribeUser => User is subscribed.");
                    } else {
                        console.log("[Main] SubscribeUser => Error.");

                    }
                }
            ).catch(
                error => {
                    console.log("[Main] SubscribeUser => Error =>", error);
                }
            );

        })
        .catch(function(err) {
            console.log("Failed to subscribe the user: ", err);
            updateBtn();
        });
}


function unsubscribeUser() {
    swRegistration.pushManager
        .getSubscription()
        .then(function(subscription) {
            if (subscription) {
                // subscription.unsubscribe();
                var userId = localStorage.getItem("userId");
				var isUnSub = updateSubscriptionOnServer(subscription, "unsub", userId);
                
                isUnSub.then(
                    result => {
                        if (result) {
                            clearIndexedDB();
                            console.log("[Main] UnsubscribeUser => User is unsubscribed.");

                        } else {
                            console.log("[Main] UnsubscribeUser => Error.");
                        }
                    }
                ).catch(
                    error => {
                        console.log("[Main] UnsubscribeUser => Error =>", error);
                    }
                );
                return subscription.unsubscribe();

            }
        })
        .catch(function(error) {
            console.log("Error unsubscribing", error);
        })
        .then(function() {

            console.log("User is unsubscribed.");
            isSubscribed = false;

            updateBtn();
        });
}

function initializeUI() {
    pushButton.addEventListener("click", function() {
        pushButton.disabled = true;
        if (isSubscribed) {
            unsubscribeUser();
        } else {
            subscribeUser();
        }
    });

    // Set the initial subscription value
    swRegistration.pushManager.getSubscription().then(function(subscription) {
        isSubscribed = !(subscription === null);

        if (isSubscribed) {
            // var userId = localStorage.getItem("userId");
            // updateSubscriptionOnServer(subscription, "sub", userId);
            console.log("User IS subscribed.");
        } else {
            console.log("User is NOT subscribed.");
        }

        updateBtn();
    });
}

if ("serviceWorker" in navigator && "PushManager" in window) {
    console.log("Service Worker and Push is supported");

    navigator.serviceWorker
        .register("/worker/sw.js")
        .then(function(swReg) {
            console.log("Service Worker is registered", swReg);

            swRegistration = swReg;
            initializeUI();
        })
        .catch(function(error) {
            console.error("Service Worker Error", error);
        });
} else {
    console.warn("Push meapplicationServerPublicKeyssaging is not supported");
    pushButton.textContent = "Push Not Supported";
}


function push_message() {
    console.log("sub_token", localStorage.getItem("sub_token"));
    $.ajax({
        type: "POST",
        url: "/push_v1/",
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        data: JSON.stringify({
            sub_token: JSON.parse(localStorage.getItem("sub_token")),
            userId : localStorage.getItem("userId"),
        }),
        success: function(data) {
            console.log("success", data);
        },
        error: function(jqXhr, textStatus, errorThrown) {
            console.log("error", errorThrown);
        },
    });
}

$(document).ready(function() {
    $.ajax({
        type: "GET",
        url: "/subscription/",
        success: function(response) {
            console.log("response", response);
            localStorage.setItem("applicationServerPublicKey", response.public_key);
        },
    });
    createIndexedDB();
    

    var subscriptionDetails = document.querySelector('.js-subscription-details');
    var subscriptionJson = document.querySelector('.js-subscription-json');

    if(localStorage.getItem('sub_token') && localStorage.getItem('userId')) {
        subscriptionDetails.classList.remove('is-invisible');
        subscriptionDetails.classList.add('is-visible');

        var subToken = localStorage.getItem('sub_token');
        var userId = localStorage.getItem('userId');

        // sub_token değerini subscriptionJson elementinin içine yaz
        if(subscriptionJson) {
            subscriptionJson.innerText = subToken;
        }
    }

});