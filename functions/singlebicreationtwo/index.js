/**
 * Describe Singlebicreation here.
 *
 * The exported method is the entry point for your code when the function is invoked.
 *
 * Following parameters are pre-configured and provided to your function on execution:
 * @param event: represents the data associated with the occurrence of an event, and
 *                 supporting metadata about the source of that occurrence.
 * @param context: represents the connection to Functions and your Salesforce org.
 * @param logger: logging handler used to capture application logs and trace specifically
 *                 to a given execution of a function.
 */

 export default async function (event, context, logger) {
  logger.info(
    `Invoking Singlebicreation with payload ${JSON.stringify(event.data || {})}`
  );

  var aliarray = [];
  var sidBIMap = {};
  var sidAliMap = {};
  var productbisid = [];
  var prodListtemp;
  var prodList = [];
  var fieldMapping = {};
  var singleBiDiscountUow = [];
  var singleBitierUow = [];
  var aliUow = [];
  var recordsToCreate = [];
  var singleBITiersUpdate = [];
  const quantityBIs = [
    "BI32d90555749797a046ca0e15d7daabae",
    "BI938e21a35f7b885caea16d370b0973ff",
    "BI3a7c833fc420b0eb7411213706f594bc",
    "BI1df60828ad02d14a8a088ec4279b7e63",
    "BIb3ca333196a8d3725517b450963919dd",
    "BI6c0085c32f2632dc1ee7125a79942c69",
    "BI7bb241fb2a6085e1caeea3b5ee26d44f"
  ];
  var productbisidstring = "(";

  for (let i = 0; i < event.data.length; i++) {
    aliarray.push(event.data[i]);
    sidAliMap[event.data[i].Id] = event.data[i].Product_BI_SID__c;
    productbisid.push(event.data[i].Product_BI_SID__c);
    productbisidstring =
      productbisidstring + "'" + event.data[i].Product_BI_SID__c + "'" + ",";
  }

  productbisidstring = productbisidstring.replace(/,\s*$/, "");
  productbisidstring = productbisidstring + ")";

  try {
    let soqlqBI = `SELECT Id,Name,BI_SID__c FROM Billable_Item__c WHERE BI_SID__c IN ${productbisidstring}`;
    let soqlCustomSetting = `SELECT Id,Name,Products_needing_Quantity__c FROM BI_Discounts_requiring_Quantity__c WHERE Name ='Products List'`;
    let soqlAliBiMapping = `SELECT Id,Name,ALI_Field__c,Single_BI_Field__c FROM ALI_to_Single_BI_Mapping__c`;

    const bisidCustSetting = await context.org.dataApi.query(soqlCustomSetting);

    const aliBiMapping = await context.org.dataApi.query(soqlAliBiMapping);

    const biSidRecords = await context.org.dataApi.query(soqlqBI);

    for (let i = 0; i < biSidRecords.records.length; i++) {
      sidBIMap[biSidRecords.records[i].fields.bi_sid__c] =
        biSidRecords.records[i].fields.id;
    }

    logger.info(`sidBIMap  ${JSON.stringify(sidBIMap)}`);

    for (let i = 0; i < bisidCustSetting.records.length; i++) {
      prodListtemp =
        bisidCustSetting.records[i].fields.products_needing_quantity__c.split(
          ","
        );
    }

    for (var i in prodListtemp) {
      let lowerCaseProd = prodListtemp[i].toLowerCase();
      prodList.push(lowerCaseProd.trim());
    }

    for (let i = 0; i < aliBiMapping.records.length; i++) {
      fieldMapping[aliBiMapping.records[i].fields.ali_field__c] =
        aliBiMapping.records[i].fields.single_bi_field__c;
    }

    const uow = context.org.dataApi.newUnitOfWork();

    const payload = event.data;
    for (let i = 0; i < payload.length; i++) {
      const fieldsObj = new Object();
      let discountType = "";
      let percentOff = "";
      let rateSchedule = "";
      let biType = "";
      let recTypeId = "";
      let quantity = "";
      let prodActStartDate = "";
      let billableItem = "";
      let flatprice = "";
      let quantityNull = true;
      let records = {};

      for (const [key, value] of Object.entries(payload[i])) {
        // logger.info(`ObjectKey  ${key}: ${value}`);
        if (key in fieldMapping) {
          let bifield = fieldMapping[key];
          fieldsObj[bifield] = value;
        }
      }

      if (
        payload[i].Apttus_CMConfig__AdjustmentType__c == "% Discount" &&
        (payload[i].Fixed_Discount_on_OF__c ||
          payload[i].Apttus__Description__c.toLowerCase().includes("row"))
      ) {
        discountType = "Percent";
        percentOff = payload[i].Apttus_CMConfig__AdjustmentAmount__c;
      } else if (
        payload[i].Pricing_Restrictions__c == "Fixed Price Ineligible"
      ) {
        discountType = "Percent";
        percentOff = payload[i].Discount_Given__c;
      } else {
        discountType = "Flat";
      }

      if (payload[i].Apttus_CMConfig__PriceType__c == "Usage") {
        rateSchedule = "Tiered";
      } else if (payload[i].Apttus_CMConfig__PriceType__c == "Recurring") {
        rateSchedule = "Monthly Recurring";
      } else {
        rateSchedule = "Metered";
      }

      if (payload[i].Apttus_CMConfig__PriceType__c == "Recurring") {
        biType = "Monthly Recurring Charge";
      } else if (payload[i].Product_Display_Type__c == "Groups") {
        if (
          payload[i].Apttus_CMConfig__OptionId__c != null &&
          payload[i].Number_of_Tiers__c > 0
        ) {
          biType = "GTM Group with Tiers";
        } else if (
          payload[i].Apttus_CMConfig__OptionId__c != null &&
          payload[i].Number_of_Tiers__c == 0
        ) {
          biType = "GTM Group without Tiers";
        }
      } else if (payload[i].Product_Display_Type__c == "Individual Products") {
        if (payload[i].Number_of_Tiers__c > 0) {
          biType = "No GTM Group With Tiers";
        } else if (payload[i].Number_of_Tiers__c == 0) {
          biType = "No GTM Group Without Tiers";
        }
      }

      if (payload[i].Is_Bundle_Product__c) {
        biType = "GTM Group without Tiers";
      }

      if (payload[i].Product_Type__c == "SKU Group") {
        recTypeId = "0121W000000MK8O";
      } else if (payload[i].Product_Type__c == "Wireless SKU Group") {
        recTypeId = "0121W0000009pe8"; //'0121W0000009pe8';
      } else {
        recTypeId = "0121W000000MK8N";
      }

      
    for (let j = 0; j < prodList.length; j++) {
      if (
        payload[i].Apttus__Description__c.toLowerCase().includes(prodList[j])
      ) {
        logger.info(`here19`);
        quantityNull = false;
        break;
      }
    } 
      quantity = quantityNull ? null : "";
      //quantity = "";
      if (
        !payload[i].Apttus__Description__c.toLowerCase().includes(
          "twilio business edition"
        )
      ) {
        prodActStartDate = payload[i].Apttus_CMConfig__StartDate__c;
      }

      let biSid = sidAliMap[payload[i].Id];

      if (biSid) {
        billableItem = sidBIMap[biSid];
        if (payload[i].Apttus__Description__c.toLowerCase().includes("flex")) {
          prodActStartDate = "";
        } else if (quantityBIs.includes(biSid)) {
          quantity = payload[i].Apttus__Quantity__c;
          if (biSid != "BI7bb241fb2a6085e1caeea3b5ee26d44f") {
            flatprice *= quantity;
          }
        }
        if (flatprice) {
          flatprice = flatprice.toPrecision(5);
        }
      }
      fieldsObj["Discount_Type__c"] = discountType;
      fieldsObj["Percent_Off__c"] = percentOff;
      fieldsObj["Rate_Schedule__c"] = rateSchedule;
      fieldsObj["Type__c"] = biType;
      fieldsObj["RecordTypeId"] = recTypeId;
      fieldsObj["Quantity__c"] = quantity; //arpit
      fieldsObj["Flat_Price__c"] = flatprice; //arpit
      fieldsObj["Billable_Item__c"] = billableItem; //arpit
      //fieldsObj["Product_Activation_Start_Date__c"] = prodActStartDate; //Arpit
      fieldsObj["Product_Activation_Start_Date__c"] = prodActStartDate !== undefined ? prodActStartDate : null
      

      records.singleBIDiscount = {
        type: "Single_BI_Discount__c",
        fields: fieldsObj
      };

      //Billable_Item__c = singleBi.Billable_Item__c,
      //ali.Billable_Item__c = sidBIMap.get(biSid);
     //Discount_Rate_End_Date__c: payload[i].Apttus_CMConfig__EndDate__c !== undefined ? payload[i].Apttus_CMConfig__EndDate__c : null,
      //Discount_Rate_Start_Date__c:payload[i].Apttus_CMConfig__StartDate__c,
      // RecordTypeId: "0121W000000DywZ  "

      if (
        payload[i].Apttus__Description__c.toLowerCase().includes("flex") &&
        payload[i].Apttus_CMConfig__OptionId__c != null
      ) {
        if (
          payload[i].Apttus__Description__c.toLowerCase().includes("additional")
        ) {
          records.singleBITier = {
            type: "Single_BI_Tier__c",
            fields: {
              Agreement__c: payload[i].Apttus__AgreementId__c,
              List_Price__c: payload[i].Apttus__ListPrice__c,
              Flat_Price__c: payload[i].Apttus_CMConfig__NetUnitPrice__c,
              Monthly_Units_Purchased__c: payload[i].Apttus__Quantity__c,
              Discount_Type__c: "Flat"
            }
          };
        } else {
          records.singleBITier = {
            type: "Single_BI_Tier__c",
            fields: {
              Agreement__c: payload[i].Apttus__AgreementId__c,
              List_Price__c: payload[i].Apttus__ListPrice__c,
              Flat_Price__c: payload[i].Apttus_CMConfig__NetUnitPrice__c,
              Monthly_Units_Purchased__c: payload[i].Apttus__Quantity__c,
              Discount_Type__c: "Flat",
              Last_Additional_Schedule__c: true
            }
          };
        }
      }
      if (biSid) {
        records.agrlineItem = {
          type: "Apttus__AgreementLineItem__c",
          fields: {
            id: payload[i].Id
          }
        };
      }
      recordsToCreate.push(records);
      if (records.singleBITier != null) {
        singleBITiersUpdate.push(records.singleBITier);
      }
    }
    // Commit the Unit of Work with all the previous registered operations
    //   const response = await context.org.dataApi.commitUnitOfWork(uow);
    for (let i = 0; i < singleBITiersUpdate.length; i++) {
      singleBITiersUpdate[i].fields.Floor__c = i;
      if (i < 9) {
        singleBITiersUpdate[i].fields.Tier_Row__c = i + 1;
      } else if (i >= 9 && i < 18) {
        singleBITiersUpdate[i].fields.Tier_Row__c = i + 81 + 1;
      } else if (i >= 18 && i < 27) {
        singleBITiersUpdate[i].fields.Tier_Row__c = i + 971 + 2;
      } else if (i >= 27 && i < 36) {
        singleBITiersUpdate[i].fields.Tier_Row__c = i + 9961 + 3;
      } else if (i >= 36 && i < 45) {
        singleBITiersUpdate[i].fields.Tier_Row__c = i + 99951 + 4;
      } else if (i >= 45 && i < 54) {
        singleBITiersUpdate[i].fields.Tier_Row__c = i + 999941 + 5;
      }
    }
    
    singleBITiersUpdate[
      singleBITiersUpdate.length - 1
    ].fields.Discount_Rate_Start_Date__c =
      singleBITiersUpdate[0].fields.Discount_Rate_Start_Date__c;

    
    if (singleBITiersUpdate.length > 1) {
      singleBITiersUpdate[
        singleBITiersUpdate.length - 2
      ].fields.Discount_Rate_End_Date__c = null;
    } 

    logger.info(`recordsToCreate123  ${JSON.stringify(recordsToCreate)}`);

    for (let i = 0; i < recordsToCreate.length; i++) {
      // First create the Single_BI_Discount__c
      logger.info(
        `singleBIDiscount1  ${JSON.stringify(
          recordsToCreate[i].singleBIDiscount
        )}`
      );

      singleBiDiscountUow[i] = uow.registerCreate(
        recordsToCreate[i].singleBIDiscount
      );
      logger.info(
        `singleBiDiscountUow[i]  ${JSON.stringify(singleBiDiscountUow[i])}`
      );

      if (recordsToCreate[i].agrlineItem !== undefined) {
        recordsToCreate[i].agrlineItem.fields.Single_BI_Discount__c =
          singleBiDiscountUow[i];
        aliUow[i] = uow.registerUpdate(recordsToCreate[i].agrlineItem);
      }

      if (recordsToCreate[i].singleBITier !== undefined) {
        recordsToCreate[i].singleBITier.fields.Single_BI_Discount__c =
          singleBiDiscountUow[i];
        logger.info(
          `newLogger  ${Object.keys(recordsToCreate[i].singleBITier)}`
        );
        singleBitierUow[i] = uow.registerCreate(
          recordsToCreate[i].singleBITier
        );
      }
    }
    const response = await context.org.dataApi.commitUnitOfWork(uow);
    return response;
  } catch (err) {
    const errorMessage = `Failed Root Cause : ${err.message}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}
