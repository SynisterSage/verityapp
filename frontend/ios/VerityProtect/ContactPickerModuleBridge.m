#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ContactPicker, NSObject)

RCT_EXTERN_METHOD(selectContacts:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getAllContacts:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
