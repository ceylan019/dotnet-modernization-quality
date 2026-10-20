export const PERMIT_TYPES = `
query PermitTypes {
  permitTypes { code name baseFee ratePerSqM reviewBusinessDays }
}`;

export const FEE_QUOTE = `
query FeeQuote($permitTypeCode: String!, $areaSqM: Decimal!, $isSenior: Boolean!, $isNonProfit: Boolean!) {
  feeQuote(permitTypeCode: $permitTypeCode, areaSqM: $areaSqM, isSenior: $isSenior, isNonProfit: $isNonProfit) {
    feeAmount hstAmount totalAmount
  }
}`;

export const DUE_DATE = `
query DueDate($permitTypeCode: String!, $submittedOn: Date!) {
  dueDate(permitTypeCode: $permitTypeCode, submittedOn: $submittedOn)
}`;

export const APPLICATION = `
query Application($referenceNumber: String!) {
  application(referenceNumber: $referenceNumber) {
    referenceNumber
    applicant { firstName lastName email phone isSenior isNonProfit }
    permitType { code name baseFee ratePerSqM reviewBusinessDays }
    siteAddress areaSqM description status submittedOn submittedAt dueDate
    feeAmount hstAmount totalAmount lastUpdatedAt
    history { fromStatus toStatus changedAt changedBy note }
  }
}`;

export const SEARCH = `
query Search($searchText: String, $status: ApplicationStatus, $page: Int, $pageSize: Int) {
  searchApplications(searchText: $searchText, status: $status, page: $page, pageSize: $pageSize) {
    totalCount page pageSize
    items {
      referenceNumber firstName lastName permitTypeCode permitTypeName
      status submittedOn dueDate totalAmount
    }
  }
}`;

export const SUBMIT = `
mutation Submit($input: ApplicationInput!) {
  submitApplication(input: $input) { referenceNumber feeAmount totalAmount dueDate }
}`;

export const CHANGE_STATUS = `
mutation ChangeStatus($referenceNumber: String!, $newStatus: ApplicationStatus!, $changedBy: String!, $note: String) {
  changeStatus(referenceNumber: $referenceNumber, newStatus: $newStatus, changedBy: $changedBy, note: $note) {
    referenceNumber
    applicant { firstName lastName email phone isSenior isNonProfit }
    permitType { code name baseFee ratePerSqM reviewBusinessDays }
    siteAddress areaSqM description status submittedOn submittedAt dueDate
    feeAmount hstAmount totalAmount lastUpdatedAt
    history { fromStatus toStatus changedAt changedBy note }
  }
}`;

// Complete enough for graphql-js buildClientSchema: interfaces, possible types, default values,
// directives and deprecated members (a deprecated field is still part of the contract).
export const INTROSPECTION = `
query Introspection {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { ...FullType }
    directives { name locations args { ...InputValue } }
  }
}
fragment FullType on __Type {
  kind
  name
  fields(includeDeprecated: true) { name args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason }
  inputFields { ...InputValue }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) { name isDeprecated deprecationReason }
  possibleTypes { ...TypeRef }
}
fragment InputValue on __InputValue { name type { ...TypeRef } defaultValue }
fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }`;
