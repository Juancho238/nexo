/** Contract for a future officially authorized Argentine identity provider.
 * No ARCA connection is implemented or simulated in this MVP.
 */
export interface VerifiedIdentity {
 dni:string;
 cuil?:string;
 fullName?:string;
 birthDate?:string;
 source:string;
 verifiedAt:string;
}
export interface AuthorizedIdentityProvider {
 lookup(identifier:{dni?:string;cuil?:string}):Promise<VerifiedIdentity|null>;
}
