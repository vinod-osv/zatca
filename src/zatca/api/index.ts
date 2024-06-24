import axios from "axios";
import { cleanUpCertificateString } from "../signing";


const settings = {
    API_VERSION: "V2",
    SANDBOX_BASEURL: "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
    PRODUCTION_BASEURL: "https://gw-fatoora.zatca.gov.sa/e-invoicing"
}

interface ComplianceAPIInterface {
    /**
     * Requests a new compliance certificate and secret.
     * @param csr String CSR
     * @param otp String Tax payer provided OTP from Fatoora portal
     * @returns issued_certificate: string, api_secret: string, or throws on error.
     */
    issueCertificate: (csr: string, otp: string) => Promise<{issued_certificate: string, api_secret: string, request_id: string}>

     /**
     * Checks compliance of a signed ZATCA XML.
     * @param signed_xml_string String.
     * @param invoice_hash String.
     * @param egs_uuid String.
     * @returns Any status.
     */
    checkInvoiceCompliance: (signed_xml_string: string, invoice_hash: string, egs_uuid: string) => Promise<any>
}


interface ProductionAPIInterface {
    /**
     * Requests a new production certificate and secret.
     * @param compliance_request_id String compliance_request_id
     * @returns issued_certificate: string, api_secret: string, or throws on error.
     */
    issueCertificate: (compliance_request_id: string) => Promise<{issued_certificate: string, api_secret: string, request_id: string}>

     /**
     * Report signed ZATCA XML.
     * @param signed_xml_string String.
     * @param invoice_hash String.
     * @param egs_uuid String.
     * @returns Any status.
     */
      reportInvoice: (signed_xml_string: string, invoice_hash: string, egs_uuid: string) => Promise<any>

}


class API {

    constructor () {
    }


    private getAuthHeaders = (certificate?: string, secret?: string): any => {
        if (certificate && secret) {
            console.log(certificate);
            const certificate_stripped = cleanUpCertificateString(certificate);
            console.log(certificate_stripped);
            const basic = Buffer.from(`${Buffer.from(certificate_stripped).toString("base64")}:${secret}`).toString("base64");
            return {
                "Authorization": `Basic ${basic}`   
            };
        }
        return {};
    }

    compliance(certificate?: string, secret?: string): ComplianceAPIInterface {
        const auth_headers = this.getAuthHeaders(certificate, secret);

        const issueCertificate = async (csr: string, otp: string): Promise<{issued_certificate: string, api_secret: string, request_id: string}> => {
            const headers = {
                "Accept-Version": settings.API_VERSION,
                OTP: otp
            };
            const url = `${settings.SANDBOX_BASEURL}/compliance`;
            let finalHeaders = {...auth_headers, ...headers};
            let crsObj = Buffer.from(csr).toString("base64");
            let reqBody = {csr: crsObj};

            console.log("Sandbox issueCertificate " +url);
            console.log("Sandbox header " +JSON.stringify(finalHeaders));
            console.log("Sandbox body " +JSON.stringify(reqBody));


            const response = await axios.post(url,
                reqBody,
                {headers: finalHeaders}
            );

            console.log("IssueCertificate Response Status: "+response.status);
                        
            if (response.status != 200) throw new Error("Error issuing a compliance certificate.");

            let issued_certificate = new Buffer(response.data.binarySecurityToken, "base64").toString();
            issued_certificate = `-----BEGIN CERTIFICATE-----\n${issued_certificate}\n-----END CERTIFICATE-----`;
            const api_secret = response.data.secret;

            return {issued_certificate, api_secret, request_id: response.data.requestID};
        }

        const checkInvoiceCompliance = async (signed_xml_string: string, invoice_hash: string, egs_uuid: string): Promise<any> => {
            const headers = {
                "Accept-Version": settings.API_VERSION,
                "Accept-Language": "en",
            };
            const url = `${settings.SANDBOX_BASEURL}/compliance/invoices`;
            let finalHeaders = {...auth_headers, ...headers};
            
            let reqBody = {
                invoiceHash: invoice_hash,
                uuid: egs_uuid,
                invoice: Buffer.from(signed_xml_string).toString("base64")
            };

            console.log("Sandbox checkInvoiceCompliance " +url);
            console.log("Sandbox checkInvoiceCompliance header " +JSON.stringify(finalHeaders));
            console.log("Sandbox checkInvoiceCompliance body " +JSON.stringify(reqBody));

            const response = await axios.post(url,
                reqBody,
                {headers: finalHeaders}
            );
            console.log("Sandbox checkInvoiceCompliance Response Status: "+response.status);
                        
            if (response.status != 200) return response.data ? response.data :{message: "Error in compliance check."} ;;
            return response.data;
        }
        
        return {
            issueCertificate,
            checkInvoiceCompliance
        }
    }


    production(certificate?: string, secret?: string): ProductionAPIInterface {
        const auth_headers = this.getAuthHeaders(certificate, secret);

        const issueCertificate = async (compliance_request_id: string): Promise<{issued_certificate: string, api_secret: string, request_id: string}> => {
            const headers = {
                "Accept-Version": settings.API_VERSION
            };
            let finalHeaders = {...auth_headers, ...headers};
            const url = `${settings.PRODUCTION_BASEURL}/core/production/csids`;

            console.log("Production issueCertificate " +url);
            console.log("Production header " +JSON.stringify(finalHeaders));

            const response = await axios.post(url,
                {compliance_request_id: compliance_request_id},
                {headers: finalHeaders}
            );

            console.log("Production IssueCertificate Response Status: "+response.status);
                        
            if (response.status != 200) throw new Error("Error issuing a production certificate.");

            let issued_certificate = new Buffer(response.data.binarySecurityToken, "base64").toString();
            issued_certificate = `-----BEGIN CERTIFICATE-----\n${issued_certificate}\n-----END CERTIFICATE-----`;
            const api_secret = response.data.secret;

            return {issued_certificate, api_secret, request_id: response.data.requestID};
        }

        const reportInvoice = async (signed_xml_string: string, invoice_hash: string, egs_uuid: string): Promise<any> => {
            const headers = {
                "Accept-Version": settings.API_VERSION,
                "Accept-Language": "en",
                "Clearance-Status": "0"
            };
            let finalHeaders = {...auth_headers, ...headers};
            const url = `${settings.PRODUCTION_BASEURL}/core/invoices/reporting/single`;
            let reqBody = {
                invoiceHash: invoice_hash,
                uuid: egs_uuid,
                invoice: Buffer.from(signed_xml_string).toString("base64")
            };

            console.log("Production reportInvoice " +url);
            console.log("Production reportInvoice header " +JSON.stringify(finalHeaders));
            console.log("Production reportInvoice header " +JSON.stringify(reqBody));

            const response = await axios.post(url,
                reqBody,
                {headers: finalHeaders}
            );
            console.log("Production IssueCertificate reportInvoice Status: "+response.status); 
            if (response.status != 200) 
                {   console.log("Error in reportInvoice ") ;
                    if(response.data){
                        console.log(JSON.stringify(response.data)) ;
                    }
                    
                    throw new Error("Error in reporting invoice.");

                }
            return response.data;
        }

        return {
            issueCertificate,
            reportInvoice
        }
    }
  

}

export default API;
