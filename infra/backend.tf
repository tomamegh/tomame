# State holds the database password and every issued key in cleartext, so it
# needs encryption, versioning and locking. An empty block takes organization
# and workspace from TF_CLOUD_ORGANIZATION and TF_WORKSPACE — see README.
terraform {
  cloud {}
}
