-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               8.4.3 - MySQL Community Server - GPL
-- Server OS:                    Win64
-- HeidiSQL Version:             12.8.0.6908
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

-- Dumping structure for table hotware-dashboard.camera_location
CREATE TABLE IF NOT EXISTS `camera_location` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `camera_name` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `province_id` char(2) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `regency_id` char(4) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `district_id` char(7) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `village_id` char(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `detail_address` varchar(255) COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_province` (`province_id`),
  KEY `idx_regency` (`regency_id`),
  KEY `idx_district` (`district_id`),
  KEY `idx_village` (`village_id`),
  CONSTRAINT `fk_camera_location_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`),
  CONSTRAINT `fk_camera_location_province` FOREIGN KEY (`province_id`) REFERENCES `provinces` (`id`),
  CONSTRAINT `fk_camera_location_regency` FOREIGN KEY (`regency_id`) REFERENCES `regencies` (`id`),
  CONSTRAINT `fk_camera_location_village` FOREIGN KEY (`village_id`) REFERENCES `villages` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Dumping data for table hotware-dashboard.camera_location: ~5 rows (approximately)
REPLACE INTO `camera_location` (`id`, `camera_name`, `province_id`, `regency_id`, `district_id`, `village_id`, `detail_address`) VALUES
	(1, 'QND-6022R', '31', '3174', '3174070', '3174070005', 'Ruko Goflake'),
	(2, 'camera-farrelTest', '36', '3671', '3671010', '3671010003', 'Cluster Pesona Japos Blok A no.04'),
	(3, 'FD9383-HTV', '94', '9420', '9420011', '9420011007', 'Cluster Papua Jaya Blok A1 No.23'),
	(4, 'FD9189-H', '91', '9105', '9105143', '9105143008', 'Gedung Burza Tower Lt.7'),
	(5, 'QNO-6022R', '31', '3174', '3174070', '3174070005', 'Ruko Goflake');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
