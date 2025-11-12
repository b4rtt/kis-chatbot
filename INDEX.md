curl -X POST -H "x-admin-key: super_secret_key" http://localhost:3000/api/admin/sync

curl -X POST -H "x-admin-key: super_secret_key" "http://localhost:3000/api/admin/reindex?sync=1"
